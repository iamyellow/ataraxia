import { Event } from 'atvik';
import debug from 'debug';

import { encodeId } from '../id';
import { WithNetwork } from '../WithNetwork';

import { Peer } from './Peer';
import { Transport } from './Transport';
import { TransportOptions } from './TransportOptions';

/**
 * Abstract base for implementing transports. Implements common behavior to
 * help with tracking of peers.
 */
export class AbstractTransport implements Transport {
	private readonly transportName: string;

	private readonly peerConnectEvent: Event<this, [ Peer ]>;
	private readonly peerDisconnectEvent: Event<this, [ Peer ]>;

	protected debug: debug.Debugger;

	private _started: boolean;

	private _network?: WithNetwork;
	protected readonly peers: Set<Peer>;

	/**
	 * Create a new instance.
	 *
	 * @param name -
	 *   name of the transport, should be short and identify, examples from the
	 *   core library include `local`, `tcp` and `hyperswarm`.
	 */
	public constructor(name: string) {
		this.peerConnectEvent = new Event(this);
		this.peerDisconnectEvent = new Event(this);

		this.peers = new Set();

		this._started = false;
		this.transportName = name;
		this.debug = debug('ataraxia:no-network:' + name);
	}

	/**
	 * Event for when a new peer is connected via this transport.
	 *
	 * @returns
	 *   `Subscribable` that can be used to register listeners
	 */
	public get onPeerConnect() {
		return this.peerConnectEvent.subscribable;
	}

	/**
	 * Event for when a peer is disconnected.
	 *
	 * @returns
	 *   `Subscribable` that can be used to register listeners
	 */
	public get onPeerDisconnect() {
		return this.peerDisconnectEvent.subscribable;
	}

	/**
	 * Get if transport is started.
	 *
	 * @returns
	 *   `true` if transport is started
	 */
	public get started() {
		return this._started;
	}

	/**
	 * Get the network of this transport. Can only be used after this transport
	 * has been started.
	 *
	 * @returns
	 *   network instance
	 */
	protected get network(): WithNetwork {
		if(! this._network) {
			throw new Error('Can\'t access network before start() is called');
		}

		return this._network;
	}

	/**
	 * Start this transport.
	 *
	 * @param options -
	 *   options as generated by the network instance
	 * @returns
	 *   boolean indicating if the transport was started
	 */
	public async start(options: TransportOptions): Promise<boolean> {
		if(this._started) {
			return false;
		}

		this.debug = debug('ataraxia:' + options.networkName + ':' + this.transportName);
		this._started = true;

		this.debug('Starting with id ' + encodeId(options.networkId));

		this._network = {
			networkIdBinary: options.networkId,
			networkId: encodeId(options.networkId),
			debugNamespace: this.debug.namespace
		};

		return true;
	}

	/**
	 * Stop this transport.
	 *
	 * @returns
	 *   boolean indicating if the transport was stopped.
	 */
	public async stop(): Promise<boolean> {
		if(! this._started) {
			return false;
		}

		for(const peer of this.peers.values()) {
			peer.disconnect();
		}

		this._started = false;
		return true;
	}

	/**
	 * Add a peer to this transport. This will start monitoring this peer
	 * for connection events and make it available/unavailable as it
	 * connects/disconnects.
	 *
	 * @param peer -
	 *   peer to track
	 */
	protected addPeer(peer: Peer) {
		const onConnect = () => {
			// New peer, connect to it
			this.peers.add(peer);

			this.debug('Peer with id', encodeId(peer.id), 'is now available');
			this.peerConnectEvent.emit(peer);
		};

		peer.onConnect(onConnect);

		peer.onDisconnect(() => {
			this.peers.delete(peer);

			this.debug('Peer with id', encodeId(peer.id), 'is no longer available');
			this.peerDisconnectEvent.emit(peer);
		});

		if(peer.connected) {
			// If adding an already connected peer run connect routine
			onConnect();
		}
	}
}

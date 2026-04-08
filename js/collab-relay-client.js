const toTrimmedString = (value, fallback = '', maxLen = 4000) => {
    if (value === null || value === undefined) return fallback;
    return String(value).slice(0, maxLen);
};

const buildPresenceState = (members = new Map()) => {
    const out = {};
    members.forEach((entry, key) => {
        if (!entry) return;
        if (!out[key]) out[key] = [];
        out[key].push({ ...entry });
    });
    return out;
};

class RelayChannel {
    constructor(options = {}) {
        const opts = options && typeof options === 'object' ? options : {};
        this.__relay = true;
        this.baseUrl = toTrimmedString(opts.baseUrl, '', 4000).trim();
        this.roomId = toTrimmedString(opts.roomId, '', 160).trim();
        this.campaignId = toTrimmedString(opts.campaignId, '', 160).trim();
        this.instanceId = toTrimmedString(opts.instanceId, '', 120).trim();
        this.presenceKey = toTrimmedString(opts.presenceKey || this.instanceId, '', 120).trim() || this.instanceId;
        this.scope = toTrimmedString(opts.scope, '', 40).trim();
        this.caseId = toTrimmedString(opts.caseId, '', 120).trim();
        this.profileName = toTrimmedString(opts.profileName, '', 120).trim();
        this.userId = toTrimmedString(opts.userId, '', 120).trim();
        this.handlers = {
            broadcast: [],
            presence: []
        };
        this.statusHandlers = [];
        this.ws = null;
        this.presenceMembers = new Map();
        this.localPresence = null;
        this.closed = false;
    }

    on(kind, filter, callback) {
        if (!this.handlers[kind] || typeof callback !== 'function') return this;
        const rule = filter && typeof filter === 'object' ? { ...filter } : {};
        this.handlers[kind].push({ rule, callback });
        return this;
    }

    emit(kind, packet) {
        const entries = this.handlers[kind] || [];
        entries.forEach(({ rule, callback }) => {
            if (kind === 'broadcast' && rule && rule.event && rule.event !== packet.event) return;
            if (kind === 'presence' && rule && rule.event && rule.event !== packet.event) return;
            try {
                callback(packet);
            } catch (err) {
                console.warn('RTF_COLLAB_RELAY: Handler failed', err);
            }
        });
    }

    notifyStatus(status) {
        this.statusHandlers.forEach((handler) => {
            try {
                handler(status);
            } catch (err) {
                console.warn('RTF_COLLAB_RELAY: Status handler failed', err);
            }
        });
    }

    buildSocketUrl() {
        const parsed = new URL(this.baseUrl, globalThis.location && globalThis.location.href ? globalThis.location.href : undefined);
        const protocol = parsed.protocol === 'https:' ? 'wss:' : (parsed.protocol === 'http:' ? 'ws:' : parsed.protocol);
        parsed.protocol = protocol;
        parsed.searchParams.set('roomId', this.roomId);
        if (this.campaignId) parsed.searchParams.set('campaignId', this.campaignId);
        if (this.instanceId) parsed.searchParams.set('instanceId', this.instanceId);
        if (this.presenceKey) parsed.searchParams.set('presenceKey', this.presenceKey);
        if (this.scope) parsed.searchParams.set('scope', this.scope);
        if (this.caseId) parsed.searchParams.set('caseId', this.caseId);
        return parsed.toString();
    }

    subscribe(callback) {
        if (typeof callback === 'function') this.statusHandlers.push(callback);
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return this;

        this.closed = false;
        const ws = new WebSocket(this.buildSocketUrl());
        this.ws = ws;

        ws.addEventListener('open', () => {
            if (this.ws !== ws || this.closed) return;
            this.sendRaw({
                type: 'join',
                payload: {
                    roomId: this.roomId,
                    campaignId: this.campaignId,
                    instanceId: this.instanceId,
                    presenceKey: this.presenceKey,
                    scope: this.scope,
                    caseId: this.caseId
                }
            });
            this.notifyStatus('SUBSCRIBED');
            if (this.localPresence) this.track(this.localPresence).catch(() => { });
        });
        ws.addEventListener('message', (event) => {
            if (this.ws !== ws || this.closed) return;
            this.handleMessage(event.data);
        });
        ws.addEventListener('error', () => {
            if (this.ws !== ws || this.closed) return;
            this.notifyStatus('CHANNEL_ERROR');
        });
        ws.addEventListener('close', () => {
            if (this.ws !== ws || this.closed) return;
            this.notifyStatus('CLOSED');
        });

        return this;
    }

    sendRaw(packet) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
        this.ws.send(JSON.stringify(packet));
        return true;
    }

    async send(packet) {
        const source = packet && typeof packet === 'object' ? packet : {};
        if (source.type !== 'broadcast') throw new Error('Relay channel only supports broadcast packets through send().');
        const ok = this.sendRaw({
            type: 'broadcast',
            event: toTrimmedString(source.event, '', 80).trim(),
            payload: source.payload && typeof source.payload === 'object' ? source.payload : {}
        });
        if (!ok) throw new Error('Relay socket is not connected.');
        return 'ok';
    }

    async track(payload) {
        this.localPresence = payload && typeof payload === 'object' ? { ...payload } : {};
        const ok = this.sendRaw({
            type: 'track',
            payload: this.localPresence
        });
        if (!ok) throw new Error('Relay socket is not connected.');
        return 'ok';
    }

    async untrack() {
        this.localPresence = null;
        this.sendRaw({ type: 'untrack' });
        return 'ok';
    }

    presenceState() {
        return buildPresenceState(this.presenceMembers);
    }

    handleMessage(raw) {
        let packet = null;
        try {
            packet = JSON.parse(raw);
        } catch (err) {
            console.warn('RTF_COLLAB_RELAY: Invalid message', err);
            return;
        }
        if (!packet || typeof packet !== 'object') return;

        if (packet.type === 'broadcast') {
            this.emit('broadcast', {
                event: toTrimmedString(packet.event, '', 80).trim(),
                payload: packet.payload && typeof packet.payload === 'object' ? packet.payload : {}
            });
            return;
        }

        if (packet.type === 'presence') {
            const state = packet.state && typeof packet.state === 'object' ? packet.state : {};
            this.presenceMembers = new Map();
            Object.keys(state).forEach((key) => {
                const list = Array.isArray(state[key]) ? state[key] : [];
                list.forEach((entry) => {
                    if (!entry || typeof entry !== 'object') return;
                    this.presenceMembers.set(`${key}:${toTrimmedString(entry.instanceId, '', 120)}`, {
                        ...entry,
                        presenceKey: key
                    });
                });
            });
            this.emit('presence', {
                event: toTrimmedString(packet.event, 'sync', 20).trim() || 'sync',
                payload: {},
                state: buildPresenceState(this.presenceMembers)
            });
        }
    }

    async close() {
        this.closed = true;
        if (this.ws) {
            try {
                this.ws.close(1000, 'client-close');
            } catch (err) { }
        }
        this.ws = null;
        this.presenceMembers = new Map();
    }
}

export const createCollabRelayChannel = (options = {}) => new RelayChannel(options);

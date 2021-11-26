import {id as pluginId} from 'manifest';

export function getPluginPath() {
    return window.basename ? `${window.basename}/plugins/${pluginId}` :
        `/plugins/${pluginId}`;
}

export function getWSConnectionURL(channelID: string): string {
    const loc = window.location;
    const uri = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${uri}//${loc.host}${getPluginPath()}/${channelID}/ws`;
}

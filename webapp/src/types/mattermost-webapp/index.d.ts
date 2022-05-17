import {Store as BaseStore} from 'redux';
import {ThunkDispatch} from 'redux-thunk';
import {GlobalState} from 'mattermost-redux/types/store';

export interface PluginRegistry {
    registerPostTypeComponent(typeName: string, component: React.ElementType)
    registerReducer(reducer: Reducer)
    registerGlobalComponent(component: React.ElementType)
    registerRootComponent(component: React.ElementType)
    registerSidebarChannelLinkLabelComponent(component: React.ElementType)
    registerChannelToastComponent(component: React.ElementType)
    registerChannelHeaderButtonAction(component: React.ElementType, fn: (channel: Channel) => void)
    registerChannelHeaderMenuAction(component: React.ElementType, fn: (channelID: string) => void)
    registerWebSocketEventHandler(evType: string, fn: (event: WebSocketEvent) => void)
    registerCustomRoute(route: string, component: React.ElementType)
    registerNeedsTeamRoute(route: string, component: React.ElementType)
    registerSlashCommandWillBePostedHook(hook: (message: string, args: CommandArgs) => any)
    registerCallButtonAction(button: React.ElementType, dropdownButton: React.ElementType, fn: (channel: Channel) => void)
    unregisterComponent(componentID: string)
    unregisterPostTypeComponent(componentID: string)
    registerReconnectHandler(handler: () => void)
    unregisterReconnectHandler(handler: () => void)
}

/**
 * Emulated Store type used in mattermost-webapp/mattermost-redux
 */
export type Store = BaseStore<GlobalState> & {dispatch: Dispatch}

export type Dispatch = ThunkDispatch<GlobalState, any, any>

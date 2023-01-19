import {Store as BaseStore} from 'redux';
import {ThunkDispatch} from 'redux-thunk';
import {GlobalState} from '@mattermost/types/store';
import {CommandArgs} from '@mattermost/types/integrations';

export interface PluginRegistry {
    registerPostTypeComponent(typeName: string, component: React.ElementType);

    registerReducer(reducer: Reducer);

    registerGlobalComponent(component: React.ElementType);

    registerRootComponent(component: React.ElementType);

    registerSidebarChannelLinkLabelComponent(component: React.ElementType);

    registerChannelToastComponent(component: React.ElementType);

    registerChannelHeaderButtonAction(component: React.ElementType, fn: (channel: Channel) => void);

    registerChannelHeaderMenuAction(component: React.ElementType, fn: (channelID: string) => void);

    registerWebSocketEventHandler(evType: string, fn: (event: WebSocketEvent) => void);

    registerCustomRoute(route: string, component: React.ElementType);

    registerNeedsTeamRoute(route: string, component: React.ElementType);

    registerSlashCommandWillBePostedHook(hook: (message: string, args: CommandArgs) => SlashCommandWillBePostedReturn);

    registerCallButtonAction(button: React.ElementType, dropdownButton: React.ElementType, fn: (channel: Channel) => void);

    unregisterComponent(componentID: string);

    unregisterPostTypeComponent(componentID: string);

    registerReconnectHandler(handler: () => void);

    unregisterReconnectHandler(handler: () => void);

    registerAdminConsoleCustomSetting(key: string, component: React.FunctionComponent<CustomComponentProps>, options?: { showTitle: boolean });
}

export type SlashCommandWillBePostedReturn = { error: string } | { message: string, args: CommandArgs } | unknown;

export interface CustomComponentProps {
    id: string;
    label: string;
    helpText: JSX.Element | null;
    value: string;
    disabled: boolean;
    config?: Record<string, unknown>;
    license?: Record<string, unknown>;
    setByEnv: boolean;
    onChange: (id: string, value: string | boolean | number, confirm?: boolean, doSubmit?: boolean, warning?: boolean) => void;
    saveAction: () => Promise<unknown>;
    unregisterSaveAction: (saveAction: () => Promise<unknown>) => void;
    setSaveNeeded: () => void;
    cancelSubmit: () => void;
    showConfirm: boolean;
}

/**
 * Emulated Store type used in mattermost-webapp/mattermost-redux
 */
export type Store = BaseStore<GlobalState> & { dispatch: Dispatch }

// eslint-disable-next-line
export type Dispatch = ThunkDispatch<GlobalState, any, any>

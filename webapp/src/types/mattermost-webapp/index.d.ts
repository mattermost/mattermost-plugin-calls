import {Channel} from '@mattermost/types/channels';
import {CommandArgs} from '@mattermost/types/integrations';
import {Post} from '@mattermost/types/posts';
import {GlobalState} from '@mattermost/types/store';
import {PluginSiteStatsHandler} from '@mattermost/types/store/plugin';
import {Store as BaseStore} from 'redux';
import {ThunkDispatch} from 'redux-thunk';
import {RealNewPostMessageProps} from 'src/types/types';

export type Translations = {
    [key: string]: string;
};

export type NewPostMessageProps = {
    mentions: string[];
    team_id: string;
}

export type DesktopNotificationArgs = {
    title: string;
    body: string;
    silent: boolean;
    soundName: string;
    url: string;
    notify: boolean;
};

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

    // registerDesktopNotificationHook requires MM v8.1
    registerDesktopNotificationHook(hook: (post: Post, msgProps: RealNewPostMessageProps, channel: Channel, teamId: string, args: DesktopNotificationArgs) => Promise<{
        error?: string;
        args?: DesktopNotificationArgs;
    }>)

    registerCallButtonAction(button: React.ElementType, dropdownButton: React.ElementType, fn: (channel: Channel) => void);

    unregisterComponent(componentID: string);

    unregisterPostTypeComponent(componentID: string);

    registerReconnectHandler(handler: () => void);

    unregisterReconnectHandler(handler: () => void);

    registerAdminConsoleCustomSetting(key: string, component: React.FunctionComponent<CustomComponentProps>, options?: { showTitle: boolean });

    registerTranslations(handler: (locale: string) => Translations | Promise<Translations>);

    registerFilePreviewComponent(overrideFn: (fi: FileInfo, post?: Post) => boolean, component: React.ElementType);

    registerSiteStatisticsHandler(handler: PluginSiteStatsHandler);
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
    registerSaveAction: (saveAction: () => Promise<{} | {error: {message: string}}>) => void;
    unRegisterSaveAction: (saveAction: () => Promise<unknown>) => void;
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

export type ModalData<ModalProps> = {
    modalId: string;
    dialogProps?: Omit<ModalProps, 'onHide' | 'onExited'> & {onHide?: () => void; onExited?: () => void};
    dialogType: React.ElementType<ModalProps>;
}

export type WebAppUtils = {

    // @ts-ignore
    modals: { openModal, ModalIdentifiers },
    notificationSounds: { ring: (sound: string) => void, stopRing: () => void },
    sendDesktopNotificationToMe: (title: string, body: string, channel: Channel, teamId: string, silent: boolean, soundName: string, url: string) => (dispatch: DispatchFunc) => void,
};

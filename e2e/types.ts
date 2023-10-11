declare global {
    interface Window {
        callsClient: any,
        desktop: any,
        isHandRaised: boolean;
        e2eDesktopNotificationsRejected?: DesktopNotificationArgs[],
        e2eDesktopNotificationsSent?: string[],
        e2eNotificationsSoundedAt?: number[],
        e2eNotificationsSoundStoppedAt?: number[],
        e2eRingLength?: number,
    }
}

export type UserState = {
    username: string;
    password: string;
    storageStatePath: string;
};

export type DesktopNotificationArgs = {
    title: string;
    body: string;
    silent: boolean;
    soundName: string;
    url: string;
    notify: boolean;
};

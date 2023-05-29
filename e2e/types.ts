declare global {
    interface Window {
        callsClient: any,
        desktop: any,
        isHandRaised: boolean;
    }
}

export type UserState = {
    username: string;
    password: string;
    storageStatePath: string;
};

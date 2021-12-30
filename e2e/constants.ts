export const baseURL = 'http://localhost:8065';
export const defaultTeam = 'calls';
export const userState = {
    admin: {
        username: 'sysadmin',
        password: 'Sys@dmin-sample1',
        storageStatePath: 'adminStorageState.json',
    },
    users: ['calls-user1', 'calls-user2', 'calls-user3', 'calls-user4'].map((name) => {
        return {
            username: name,
            password: 'U$er-sample1',
            storageStatePath: `${name}StorageState.json`,
        };
    }),
};

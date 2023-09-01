import {Client4} from '@mattermost/client';
import {Options} from '@mattermost/types/client4';

class RestClient4 extends Client4 {
    doFetch = async <ClientDataResponse>(url: string, options: Options): Promise<ClientDataResponse> => {
        return super.doFetch<ClientDataResponse>(url, options);
    };
}

const RestClient = new RestClient4();

export default RestClient;

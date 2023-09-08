import {Client4} from '@mattermost/client';
import {Options} from '@mattermost/types/client4';

class RestClient4 extends Client4 {
    fetch = async <ClientDataResponse>(url: string, options: Options): Promise<ClientDataResponse> => {
        return this.doFetch<ClientDataResponse>(url, options);
    };
}

const RestClient = new RestClient4();

export default RestClient;

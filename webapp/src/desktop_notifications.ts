import {Channel} from '@mattermost/types/channels';
import {Post} from '@mattermost/types/posts';
import {ringingEnabled} from 'src/selectors';
import {DesktopNotificationArgs, Store} from 'src/types/mattermost-webapp';
import {isDmGmChannel} from 'src/utils';

export function desktopNotificationHandler(store: Store, post: Post, channel: Channel, args: DesktopNotificationArgs): {error?: string, args?: DesktopNotificationArgs} {
    if (args.notify) {
        // Calls will notify if:
        //  1. it's a custom_calls post (call has started)
        //  2. in a DM or GM channel
        //  3. calls ringing is enabled on the server
        //  4. calls is enabled and is v0.18.0+ (it is if this is running)
        //  5. MM server is >= v8.1.0 (if not, this handler will not be called)

        // @ts-ignore our imported webapp types are old
        if (post.type === 'custom_calls' &&
            isDmGmChannel(channel) &&
            ringingEnabled(store.getState())) {
            return {args: {...args, notify: false}};
        }
    }

    return {args};
}

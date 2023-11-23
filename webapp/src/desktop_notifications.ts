import {Channel} from '@mattermost/types/channels';
import {Post} from '@mattermost/types/posts';
import {getCurrentUserId} from 'mattermost-redux/selectors/entities/users';
import {CALL_START_POST_TYPE} from 'src/constants';
import {
    channelIDForCurrentCall,
    ringingEnabled,
    threadIDForCurrentCall,
} from 'src/selectors';
import {DesktopNotificationArgs, Store} from 'src/types/mattermost-webapp';
import {RealNewPostMessageProps} from 'src/types/types';
import {isDmGmChannel} from 'src/utils';

export function desktopNotificationHandler(
    store: Store,
    post: Post,
    msgProps: RealNewPostMessageProps,
    channel: Channel,
    args: DesktopNotificationArgs,
): { error?: string, args?: DesktopNotificationArgs } {
    if (args.notify) {
        // Calls will notify if:
        //  1. it's a custom_calls post (call has started)
        //  2. in a DM or GM channel
        //  3. calls ringing is enabled on the server
        //  4. calls is enabled and is v0.18.0+ (it is if this is running)
        //  5. MM server is >= v8.1.0 (if not, this handler will not be called)

        // @ts-ignore our imported webapp types are old
        if (post.type === CALL_START_POST_TYPE &&
            isDmGmChannel(channel) &&
            ringingEnabled(store.getState())) {
            // e2eNotificationsRejected is added when running the e2e tests
            if (window.e2eDesktopNotificationsRejected) {
                window.e2eDesktopNotificationsRejected.push(args);
            }
            return {args: {...args, notify: false}};
        }

        // Do not notify for a call's thread if the user is currently in that call...
        if (channelIDForCurrentCall(store.getState()) === post.channel_id &&
            threadIDForCurrentCall(store.getState()) === post.root_id) {
            let mentions = [];
            if (msgProps.mentions) {
                mentions = JSON.parse(msgProps.mentions);
            }

            // ...and wasn't directly mentioned.
            if (!mentions.includes(getCurrentUserId(store.getState()))) {
                return {args: {...args, notify: false}};
            }
        }
    }

    return {args};
}

import {getCurrentChannelId} from 'mattermost-redux/selectors/entities/channels';
import React from 'react';
import {useIntl} from 'react-intl';
import {useSelector} from 'react-redux';
import ConnectedProfiles from 'src/components/connected_profiles';
import ActiveCallIcon from 'src/components/icons/active_call_icon';
import {useDismissJoin} from 'src/components/incoming_calls/hooks';
import Timestamp from 'src/components/timestamp';
import {
    callInCurrentChannel,
    channelIDForCurrentCall,
    dismissedCallForCurrentChannel,
    isLimitRestricted,
    profilesInCallInCurrentChannel,
} from 'src/selectors';
import {callStartedTimestampFn} from 'src/utils';

const ChannelCallToast = () => {
    const intl = useIntl();
    const currChannelID = useSelector(getCurrentChannelId);
    const connectedID = useSelector(channelIDForCurrentCall);
    const call = useSelector(callInCurrentChannel);
    const profiles = useSelector(profilesInCallInCurrentChannel);
    const limitRestricted = useSelector(isLimitRestricted);
    const dismissed = useSelector(dismissedCallForCurrentChannel);

    const callID = useSelector(callInCurrentChannel)?.ID || '';
    const [onDismiss, onJoin] = useDismissJoin(currChannelID, callID);

    const hasCall = (call && currChannelID !== connectedID);

    if (!hasCall || dismissed || limitRestricted) {
        return null;
    }

    const timestampFn = () => callStartedTimestampFn(intl, call.startAt);

    return (
        <div
            id='calls-channel-toast'
            className='toast toast__visible'
            style={{backgroundColor: '#339970'}}
        >
            <div
                className='toast__message toast__pointer'
                onClick={onJoin}
            >
                <div style={{position: 'absolute'}}>
                    <ActiveCallIcon
                        fill='white'
                        style={{margin: '0 4px', width: '12px', height: '12px'}}
                    />
                    <span style={{margin: '0 4px'}}>{intl.formatMessage({defaultMessage: 'Join call'})}</span>
                    <span style={{opacity: '0.80', margin: '0 4px'}}>
                        {intl.formatMessage(
                            {defaultMessage: 'Started {callStartedAt}'},
                            {
                                callStartedAt: (
                                    <Timestamp
                                        timestampFn={timestampFn}
                                        interval={5000}
                                    />
                                ),
                            },
                        )}
                    </span>
                    <div/>
                </div>
            </div>

            <div
                style={
                    {
                        position: 'absolute',
                        display: 'flex',
                        alignItems: 'center',
                        height: '100%',
                        right: '40px',
                    }
                }
            >
                <ConnectedProfiles
                    profiles={profiles}
                    size={24}
                    fontSize={10}
                    border={false}
                    maxShowedProfiles={2}
                />
            </div>

            <div
                className='toast__dismiss'
                onClick={onDismiss}
            >
                <span className='close-btn'>
                    <svg
                        width='24px'
                        height='24px'
                        viewBox='0 0 24 24'
                        role='img'
                        aria-label={intl.formatMessage({defaultMessage: 'Close icon'})}
                    >
                        <path
                            fillRule='nonzero'
                            d='M18 7.209L16.791 6 12 10.791 7.209 6 6 7.209 10.791 12 6 16.791 7.209 18 12 13.209 16.791 18 18 16.791 13.209 12z'
                        />
                    </svg>
                </span>
            </div>
        </div>
    );
};

export default ChannelCallToast;

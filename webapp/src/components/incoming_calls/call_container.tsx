import {getMyTeams} from 'mattermost-redux/selectors/entities/teams';
import React from 'react';
import {useSelector} from 'react-redux';

import styled from 'styled-components';

import {shouldRenderCallsIncoming} from 'src/utils';

import {useOnACallWithoutGlobalWidget} from 'src/components/incoming_calls/hooks';
import {CallIncomingCondensed} from 'src/components/incoming_calls/call_incoming_condensed';
import {sortedIncomingCalls} from 'src/selectors';
import {CallIncoming} from 'src/components/incoming_calls/call_incoming';

export const IncomingCallContainer = () => {
    const calls = [...useSelector(sortedIncomingCalls)];
    const myTeams = useSelector(getMyTeams);
    const onACallWithoutGlobalWidget = useOnACallWithoutGlobalWidget();

    if (!shouldRenderCallsIncoming() || calls.length === 0 || onACallWithoutGlobalWidget) {
        // don't show incoming calls if we're on a call without the global widget because
        // we'll see the notification above the widget
        return null;
    }

    const wider = myTeams?.length > 1;
    const firstCall = calls.splice(-1)[0];

    return (
        <Container wider={wider}>
            {calls.map((c) => (
                <CallIncomingCondensed
                    key={c.callID}
                    call={c}
                />
            ))}
            <CallIncoming call={firstCall}/>
        </Container>
    );
};

const Container = styled.div<{ wider: boolean }>`
    position: absolute;
    display: flex;
    flex-direction: column;
    gap: 5px;
    z-index: 102;
    width: ${(props) => (props.wider ? '280px' : '216px')};
    bottom: 10px;
    left: 12px;
`;
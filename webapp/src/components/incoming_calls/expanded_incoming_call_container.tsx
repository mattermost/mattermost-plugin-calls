import React from 'react';
import {useSelector} from 'react-redux';
import {CallIncomingCondensed} from 'src/components/incoming_calls/call_incoming_condensed';
import {ringingEnabled, sortedIncomingCalls} from 'src/selectors';
import styled from 'styled-components';

export const ExpandedIncomingCallContainer = () => {
    const enabled = useSelector(ringingEnabled);
    const calls = useSelector(sortedIncomingCalls);

    if (!enabled || calls.length === 0) {
        return null;
    }

    return (
        <Container>
            {calls.map((c) => (
                <StyledCallIncoming
                    key={c.callID}
                    call={c}
                    joinButtonBorder={true}
                />
            ))}
        </Container>
    );
};

const Container = styled.div`
    display: flex;
    flex-direction: column;
    align-self: flex-start;
    gap: 5px;
    margin-left: auto;
    margin-right: 4px;
    z-index: 10;
`;

const StyledCallIncoming = styled(CallIncomingCondensed)`
    max-width: 287px;
`;

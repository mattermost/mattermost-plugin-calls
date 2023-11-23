import React from 'react';
import {useSelector} from 'react-redux';
import {CallIncomingCondensed} from 'src/components/incoming_calls/call_incoming_condensed';
import {ringingEnabled, sortedIncomingCalls} from 'src/selectors';
import styled from 'styled-components';

export const ExpandedCallContainer = () => {
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
    margin-top: 8px;
    gap: 5px;
    margin-right: 7px;
    z-index: 1;
`;

const StyledCallIncoming = styled(CallIncomingCondensed)`
    max-width: 287px;
`;

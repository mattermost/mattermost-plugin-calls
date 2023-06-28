import React from 'react';
import {useSelector} from 'react-redux';

import styled from 'styled-components';

import {CallIncomingCondensed} from 'src/components/incoming_calls/call_incoming_condensed';

import {ringingEnabled, sortedIncomingCalls} from 'src/selectors';

export const ExpandedCallContainer = () => {
    const enabled = useSelector(ringingEnabled);
    const calls = useSelector(sortedIncomingCalls);

    if (!enabled || calls.length === 0) {
        return null;
    }

    return (
        <OuterContainer>
            <Container>
                {calls.map((c) => (
                    <StyledCallIncoming
                        key={c.callID}
                        call={c}
                        joinButtonBorder={true}
                    />
                ))}
            </Container>
        </OuterContainer>
    );
};

const OuterContainer = styled.div`
    text-align: right;
    overflow: hidden;
    white-space: nowrap;
`;

const Container = styled.div`
    float: right;
    display: flex;
    gap: 5px;
    margin-right: 7px;
`;

const StyledCallIncoming = styled(CallIncomingCondensed)`
    max-width: 287px;
`;

// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useRingbackTone} from 'src/components/use_ringback_tone';

// As the call_widget component is not a functional component
// we need to wrap the useRingback hook in a container component.
export const RingbackContainer = () => {
    useRingbackTone();
    return null;
};

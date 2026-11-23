// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useEffect, useState} from 'react';

type MediaPermissionName = 'camera' | 'microphone';

// Null where the browser can't report this permission (for example older Firefox and Safari).
export function usePermissionState(name: MediaPermissionName): PermissionState | null {
    const [state, setState] = useState<PermissionState | null>(null);

    useEffect(() => {
        let cancelled = false;
        let stopListening: (() => void) | undefined;

        navigator.permissions?.query({name}).then((status) => {
            if (cancelled) {
                return;
            }
            const onChange = () => setState(status.state);
            setState(status.state);
            status.addEventListener('change', onChange);
            stopListening = () => status.removeEventListener('change', onChange);
        }).catch(() => {
            setState(null);
        });

        return () => {
            cancelled = true;
            stopListening?.();
        };
    }, [name]);

    return state;
}

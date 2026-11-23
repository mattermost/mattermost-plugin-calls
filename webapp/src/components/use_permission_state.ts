// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useEffect, useState} from 'react';

type MediaPermissionName = 'camera' | 'microphone';

// Null where the browser can't report this permission (for example older Firefox and Safari).
export function usePermissionState(name: MediaPermissionName): PermissionState | null {
    const [state, setState] = useState<PermissionState | null>(null);

    useEffect(() => {
        let cancelled = false;
        let status: PermissionStatus | null = null;
        const onChange = () => setState(status?.state ?? null);

        navigator.permissions?.query({name}).then((result) => {
            if (cancelled) {
                return;
            }
            status = result;
            setState(result.state);
            result.addEventListener('change', onChange);
        }).catch(() => {
            setState(null);
        });

        return () => {
            cancelled = true;
            status?.removeEventListener('change', onChange);
        };
    }, [name]);

    return state;
}

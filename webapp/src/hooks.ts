import {
    MutableRefObject,
    useCallback,
    useEffect,
    useMemo,
    useLayoutEffect,
    useState,
} from 'react';
import {useDispatch, useSelector} from 'react-redux';
import {DateTime} from 'luxon';

import {getProfilesInCurrentTeam} from 'mattermost-redux/selectors/entities/users';
import {getCurrentChannelId} from 'mattermost-redux/selectors/entities/channels';
import {getCurrentTeamId} from 'mattermost-redux/selectors/entities/teams';
import {GlobalState} from 'mattermost-redux/types/store';

import {DispatchFunc} from 'mattermost-redux/types/actions';
import {getProfilesInChannel, getProfilesInTeam} from 'mattermost-redux/actions/users';

import {getProfileSetForChannel} from 'src/selectors';

export const PROFILE_CHUNK_SIZE = 200;

/**
 * Hook that calls handler when targetKey is pressed.
 */
export function useKeyPress(targetKey: string | ((e: KeyboardEvent) => boolean), handler: () => void) {
    const predicate: (e: KeyboardEvent) => boolean = useMemo(() => {
        if (typeof targetKey === 'string') {
            return (e: KeyboardEvent) => e.key === targetKey;
        }

        return targetKey;
    }, [targetKey]);

    // Add event listeners
    useEffect(() => {
        // If pressed key is our target key then set to true
        function downHandler(e: KeyboardEvent) {
            if (predicate(e)) {
                handler();
            }
        }

        window.addEventListener('keydown', downHandler);

        // Remove event listeners on cleanup
        return () => {
            window.removeEventListener('keydown', downHandler);
        };
    }, [handler, predicate]);
}

/**
 * Hook that alerts clicks outside of the passed ref.
 */
export function useClickOutsideRef(
    ref: MutableRefObject<HTMLElement | null>,
    handler: () => void,
) {
    useEffect(() => {
        function onMouseDown(event: MouseEvent) {
            const target = event.target as any;
            if (
                ref.current &&
                target instanceof Node &&
                !ref.current.contains(target)
            ) {
                handler();
            }
        }

        // Bind the event listener
        document.addEventListener('mousedown', onMouseDown);
        return () => {
            // Unbind the event listener on clean up
            document.removeEventListener('mousedown', onMouseDown);
        };
    }, [ref, handler]);
}

export const usePortal = () => {
    const [el] = useState(document.createElement('div'));
    useLayoutEffect(() => {
        const rootPortal = document.getElementById('root-portal');
        if (rootPortal) {
            rootPortal.appendChild(el);
        }
        return () => {
            if (rootPortal) {
                rootPortal.removeChild(el);
            }
        };
    }, [el]);
    return el;
};

// useClientRect will be called only when the component mounts and unmounts, so changes to the
// component's size will not cause rect to change. If you want to be notified of changes after
// mounting, you will need to add ResizeObserver to this hook.
export function useClientRect() {
    const [rect, setRect] = useState(new DOMRect());

    const ref = useCallback((node) => {
        if (node !== null) {
            setRect(node.getBoundingClientRect());
        }
    }, []);

    return [rect, ref] as const;
}

export function useNow(refreshIntervalMillis = 1000) {
    const [now, setNow] = useState(DateTime.now());

    useEffect(() => {
        const tick = () => {
            setNow(DateTime.now());
        };
        const timerId = setInterval(tick, refreshIntervalMillis);

        return () => {
            clearInterval(timerId);
        };
    }, [refreshIntervalMillis]);

    return now;
}

// lockProfilesInTeamFetch and lockProfilesInChannelFetch prevent concurrently fetching profiles
// from multiple components mounted at the same time, only to all fetch the same data.
//
// Ideally, we would offload this to a Redux saga in the webapp and simply dispatch a
// FETCH_PROFILES_IN_TEAM that handles all this complexity itself.
const lockProfilesInTeamFetch = new Set<string>();
const lockProfilesInChannelFetch = new Set<string>();

// clearLocks is exclusively for testing.
export function clearLocks() {
    lockProfilesInTeamFetch.clear();
    lockProfilesInChannelFetch.clear();
}

// useProfilesInChannel ensures at least the first page of members for the given channel has been
// loaded into Redux.
//
// See useProfilesInTeam for additional detail regarding semantics.
export function useProfilesInChannel(channelId: string) {
    const dispatch = useDispatch() as DispatchFunc;
    const profilesInChannel = useSelector((state) =>
        getProfileSetForChannel(state as GlobalState, channelId),
    );

    useEffect(() => {
        if (profilesInChannel.length > 0) {
            // As soon as we successfully fetch a channel's profiles, clear the bit that prevents
            // concurrent fetches. We won't try again since we shouldn't forget these profiles,
            // but we also don't want to unexpectedly block this forever.
            lockProfilesInChannelFetch.delete(channelId);
            return;
        }

        // Avoid issuing multiple concurrent fetches for this channel.
        if (lockProfilesInChannelFetch.has(channelId)) {
            return;
        }
        lockProfilesInChannelFetch.add(channelId);

        dispatch(getProfilesInChannel(channelId, 0, PROFILE_CHUNK_SIZE));
    }, [channelId]);

    return profilesInChannel;
}

// useProfilesInCurrentChannel ensures at least the first page of members for the current channel
// has been loaded into Redux.
//
// See useProfilesInChannel for additional context.
export function useProfilesInCurrentChannel() {
    const currentChannelId = useSelector(getCurrentChannelId);
    const profilesInChannel = useProfilesInChannel(currentChannelId);

    return profilesInChannel;
}

// useProfilesInTeam ensures at least the first page of team members has been loaded into Redux.
//
// This pattern relieves components from having to issue their own directives to populate the
// Redux cache when rendering in contexts where the webapp doesn't already do this itself.
//
// Since we never discard Redux metadata, this hook will fetch successfully at most once. If there
// are already members in the team, the hook skips the fetch altogether. If the fetch fails, the
// hook won't try again unless the containing component is re-mounted.
//
// A global lockProfilesInTeamFetch cache avoids the thundering herd problem of many components
// wanting the same metadata.
export function useProfilesInTeam() {
    const dispatch = useDispatch();
    const profilesInTeam = useSelector(getProfilesInCurrentTeam);
    const currentTeamId = useSelector(getCurrentTeamId);

    useEffect(() => {
        if (profilesInTeam.length > 0) {
            // As soon as we successfully fetch a team's profiles, clear the bit that prevents
            // concurrent fetches. We won't try again since we shouldn't forget these profiles,
            // but we also don't want to unexpectedly block this forever.
            lockProfilesInTeamFetch.delete(currentTeamId);
            return;
        }

        // Avoid issuing multiple concurrent fetches for this team.
        if (lockProfilesInTeamFetch.has(currentTeamId)) {
            return;
        }
        lockProfilesInTeamFetch.add(currentTeamId);

        dispatch(getProfilesInTeam(currentTeamId, 0, PROFILE_CHUNK_SIZE));
    }, [currentTeamId, profilesInTeam]);

    return profilesInTeam;
}

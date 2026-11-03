// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// makeSameChannelLinkClickHandler returns a capture-phase click handler that
// intercepts same-channel ?join_call=true links. When the link target is the
// channel the user is already viewing, the webapp short-circuits navigation
// entirely and the URL never updates, so JoinCallWatcher can't detect the
// click. This handler catches it directly.
//
// Cross-channel clicks are intentionally NOT intercepted — they fall through
// to React Router and are handled by JoinCallWatcher after navigation.
export function makeSameChannelLinkClickHandler(
    getCurrentTeamName: () => string | undefined,
    getCurrentChannelId: () => string,
    getCurrentChannelName: () => string | undefined,
    onJoinCall: (channelId: string) => void,
): (e: MouseEvent) => void {
    return (e: MouseEvent) => {
        // Preserve normal browser behavior for non-primary clicks and modified
        // clicks (Cmd/Ctrl-click → new tab, Shift-click → new window).
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
            return;
        }

        const link = (e.target as HTMLElement | null)?.closest('a');
        if (!link || (link.target && link.target !== '_self')) {
            return;
        }

        const href = link.getAttribute('href');
        if (!href) {
            return;
        }

        let url: URL;
        try {
            url = new URL(href, window.location.origin);
        } catch {
            return;
        }
        if (url.origin !== window.location.origin) {
            return;
        }
        if (url.searchParams.get('join_call') !== 'true') {
            return;
        }

        // On subpath deployments, url.pathname is /<basename>/<team>/...
        // — strip the basename so the regex matches the team segment
        // correctly. JoinCallWatcher doesn't need this because React
        // Router's history is configured with basename and useLocation
        // already returns paths relative to it.
        const pathname = window.basename && url.pathname.startsWith(window.basename) ?
            url.pathname.slice(window.basename.length) :
            url.pathname;

        // Match the team segment — a cross-team link like
        // /other-team/channels/<name> would otherwise mis-resolve against
        // the current channel's name in the current team.
        const targetMatch = pathname.match(/^\/([^/]+)\/channels\/([^/]+)/);
        if (!targetMatch) {
            return;
        }
        const [, teamName, target] = targetMatch;

        const currentTeamName = getCurrentTeamName();
        if (!currentTeamName || teamName !== currentTeamName) {
            return;
        }

        const channelId = getCurrentChannelId();
        const channelName = getCurrentChannelName();
        if (target !== channelId && target !== channelName) {
            return;
        }

        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        // Defer to the next tick so the click event finishes propagating
        // before the switch modal might be shown — the modal's closeOnBlur
        // handler is registered in capture phase and would otherwise catch
        // this same click and immediately hide the modal.
        setTimeout(() => onJoinCall(channelId), 0);
    };
}

import cssVars from 'css-vars-ponyfill';
import {Theme} from 'mattermost-redux/selectors/entities/preferences';
import {blendColors, changeOpacity} from 'mattermost-redux/utils/theme_utils';

// NOTE: functions in this file are ported over from mattermost-webapp/utils/utils.tsx
// with some unnecessary code removed.

function dropAlpha(value: string): string {
    return value.substr(value.indexOf('(') + 1).split(',', 3).join(',');
}

// given '#fffff', returns '255, 255, 255' (no trailing comma)
export function toRgbValues(hexStr: string): string {
    const rgbaStr = `${parseInt(hexStr.substr(1, 2), 16)}, ${parseInt(hexStr.substr(3, 2), 16)}, ${parseInt(hexStr.substr(5, 2), 16)}`;
    return rgbaStr;
}

export function applyTheme(theme: Theme) {
    cssVars({
        variables: {

            // RGB values derived from theme hex values i.e. '255, 255, 255'
            // (do not apply opacity mutations here)
            'away-indicator-rgb': toRgbValues(theme.awayIndicator),
            'button-bg-rgb': toRgbValues(theme.buttonBg),
            'button-color-rgb': toRgbValues(theme.buttonColor),
            'center-channel-bg-rgb': toRgbValues(theme.centerChannelBg),
            'center-channel-color-rgb': toRgbValues(theme.centerChannelColor),
            'dnd-indicator-rgb': toRgbValues(theme.dndIndicator),
            'error-text-color-rgb': toRgbValues(theme.errorTextColor),
            'link-color-rgb': toRgbValues(theme.linkColor),
            'mention-bg-rgb': toRgbValues(theme.mentionBg),
            'mention-color-rgb': toRgbValues(theme.mentionColor),
            'mention-highlight-bg-rgb': toRgbValues(theme.mentionHighlightBg),
            'mention-highlight-link-rgb': toRgbValues(theme.mentionHighlightLink),
            'mention-highlight-bg-mixed-rgb': dropAlpha(blendColors(theme.centerChannelBg, theme.mentionHighlightBg, 0.5)),
            'pinned-highlight-bg-mixed-rgb': dropAlpha(blendColors(theme.centerChannelBg, theme.mentionHighlightBg, 0.24)),
            'own-highlight-bg-rgb': dropAlpha(blendColors(theme.mentionHighlightBg, theme.centerChannelColor, 0.05)),
            'new-message-separator-rgb': toRgbValues(theme.newMessageSeparator),
            'online-indicator-rgb': toRgbValues(theme.onlineIndicator),
            'sidebar-bg-rgb': toRgbValues(theme.sidebarBg),
            'sidebar-header-bg-rgb': toRgbValues(theme.sidebarHeaderBg),
            'sidebar-teambar-bg-rgb': toRgbValues(theme.sidebarTeamBarBg),
            'sidebar-header-text-color-rgb': toRgbValues(theme.sidebarHeaderTextColor),
            'sidebar-text-rgb': toRgbValues(theme.sidebarText),
            'sidebar-text-active-border-rgb': toRgbValues(theme.sidebarTextActiveBorder),
            'sidebar-text-active-color-rgb': toRgbValues(theme.sidebarTextActiveColor),
            'sidebar-text-hover-bg-rgb': toRgbValues(theme.sidebarTextHoverBg),
            'sidebar-unread-text-rgb': toRgbValues(theme.sidebarUnreadText),

            // Hex CSS variables
            'sidebar-bg': theme.sidebarBg,
            'sidebar-text': theme.sidebarText,
            'sidebar-unread-text': theme.sidebarUnreadText,
            'sidebar-text-hover-bg': theme.sidebarTextHoverBg,
            'sidebar-text-active-border': theme.sidebarTextActiveBorder,
            'sidebar-text-active-color': theme.sidebarTextActiveColor,
            'sidebar-header-bg': theme.sidebarHeaderBg,
            'sidebar-teambar-bg': theme.sidebarTeamBarBg,
            'sidebar-header-text-color': theme.sidebarHeaderTextColor,
            'online-indicator': theme.onlineIndicator,
            'away-indicator': theme.awayIndicator,
            'dnd-indicator': theme.dndIndicator,
            'mention-bg': theme.mentionBg,
            'mention-color': theme.mentionColor,
            'center-channel-bg': theme.centerChannelBg,
            'center-channel-color': theme.centerChannelColor,
            'new-message-separator': theme.newMessageSeparator,
            'link-color': theme.linkColor,
            'button-bg': theme.buttonBg,
            'button-color': theme.buttonColor,
            'error-text': theme.errorTextColor,
            'mention-highlight-bg': theme.mentionHighlightBg,
            'mention-highlight-link': theme.mentionHighlightLink,

            // Legacy variables with baked in opacity, do not use!
            'sidebar-text-08': changeOpacity(theme.sidebarText, 0.08),
            'sidebar-text-16': changeOpacity(theme.sidebarText, 0.16),
            'sidebar-text-30': changeOpacity(theme.sidebarText, 0.3),
            'sidebar-text-40': changeOpacity(theme.sidebarText, 0.4),
            'sidebar-text-50': changeOpacity(theme.sidebarText, 0.5),
            'sidebar-text-60': changeOpacity(theme.sidebarText, 0.6),
            'sidebar-text-72': changeOpacity(theme.sidebarText, 0.72),
            'sidebar-text-80': changeOpacity(theme.sidebarText, 0.8),
            'sidebar-header-text-color-80': changeOpacity(theme.sidebarHeaderTextColor, 0.8),
            'center-channel-bg-88': changeOpacity(theme.centerChannelBg, 0.88),
            'center-channel-color-88': changeOpacity(theme.centerChannelColor, 0.88),
            'center-channel-bg-80': changeOpacity(theme.centerChannelBg, 0.8),
            'center-channel-color-80': changeOpacity(theme.centerChannelColor, 0.8),
            'center-channel-color-72': changeOpacity(theme.centerChannelColor, 0.72),
            'center-channel-bg-64': changeOpacity(theme.centerChannelBg, 0.64),
            'center-channel-color-64': changeOpacity(theme.centerChannelColor, 0.64),
            'center-channel-bg-56': changeOpacity(theme.centerChannelBg, 0.56),
            'center-channel-color-56': changeOpacity(theme.centerChannelColor, 0.56),
            'center-channel-color-48': changeOpacity(theme.centerChannelColor, 0.48),
            'center-channel-bg-40': changeOpacity(theme.centerChannelBg, 0.4),
            'center-channel-color-40': changeOpacity(theme.centerChannelColor, 0.4),
            'center-channel-bg-30': changeOpacity(theme.centerChannelBg, 0.3),
            'center-channel-color-32': changeOpacity(theme.centerChannelColor, 0.32),
            'center-channel-bg-20': changeOpacity(theme.centerChannelBg, 0.2),
            'center-channel-color-20': changeOpacity(theme.centerChannelColor, 0.2),
            'center-channel-bg-16': changeOpacity(theme.centerChannelBg, 0.16),
            'center-channel-color-24': changeOpacity(theme.centerChannelColor, 0.24),
            'center-channel-color-16': changeOpacity(theme.centerChannelColor, 0.16),
            'center-channel-bg-08': changeOpacity(theme.centerChannelBg, 0.08),
            'center-channel-color-08': changeOpacity(theme.centerChannelColor, 0.08),
            'center-channel-color-04': changeOpacity(theme.centerChannelColor, 0.04),
            'link-color-08': changeOpacity(theme.linkColor, 0.08),
            'button-bg-88': changeOpacity(theme.buttonBg, 0.88),
            'button-color-88': changeOpacity(theme.buttonColor, 0.88),
            'button-bg-80': changeOpacity(theme.buttonBg, 0.8),
            'button-color-80': changeOpacity(theme.buttonColor, 0.8),
            'button-bg-72': changeOpacity(theme.buttonBg, 0.72),
            'button-color-72': changeOpacity(theme.buttonColor, 0.72),
            'button-bg-64': changeOpacity(theme.buttonBg, 0.64),
            'button-color-64': changeOpacity(theme.buttonColor, 0.64),
            'button-bg-56': changeOpacity(theme.buttonBg, 0.56),
            'button-color-56': changeOpacity(theme.buttonColor, 0.56),
            'button-bg-48': changeOpacity(theme.buttonBg, 0.48),
            'button-color-48': changeOpacity(theme.buttonColor, 0.48),
            'button-bg-40': changeOpacity(theme.buttonBg, 0.4),
            'button-color-40': changeOpacity(theme.buttonColor, 0.4),
            'button-bg-30': changeOpacity(theme.buttonBg, 0.32),
            'button-color-32': changeOpacity(theme.buttonColor, 0.32),
            'button-bg-24': changeOpacity(theme.buttonBg, 0.24),
            'button-color-24': changeOpacity(theme.buttonColor, 0.24),
            'button-bg-16': changeOpacity(theme.buttonBg, 0.16),
            'button-color-16': changeOpacity(theme.buttonColor, 0.16),
            'button-bg-08': changeOpacity(theme.buttonBg, 0.08),
            'button-color-08': changeOpacity(theme.buttonColor, 0.08),
            'button-bg-04': changeOpacity(theme.buttonBg, 0.04),
            'button-color-04': changeOpacity(theme.buttonColor, 0.04),
            'error-text-08': changeOpacity(theme.errorTextColor, 0.08),
            'error-text-12': changeOpacity(theme.errorTextColor, 0.12),
        },
    });
}

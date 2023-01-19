// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// these css utilities are exclusively for use in expanded-window to force dark theme Onyx so that RHS styling matches.

import {
    changeOpacity,
    blendColors,
} from 'mattermost-redux/utils/theme_utils';
import cssVars from 'css-vars-ponyfill';
import {Preferences} from 'mattermost-redux/constants';

// @ts-ignore
import monokaiCSS from '!!highlight.js/styles/monokai.css?inline';

// TODO use applyTheme from mattermost-redux or other exported utility library when/if it becomes available
export function applyOnyx() {
    const theme = Preferences.THEMES.onyx;

    if (theme.centerChannelColor) {
        changeCss('.app__body .bg-text-200', 'background:' + changeOpacity(theme.centerChannelColor, 0.2));
        changeCss('.app__body .user-popover__role', 'background:' + changeOpacity(theme.centerChannelColor, 0.3));
        changeCss('.app__body .svg-text-color', 'fill:' + theme.centerChannelColor);
        changeCss('.app__body .suggestion-list__icon .status.status--group, .app__body .multi-select__note', 'background:' + changeOpacity(theme.centerChannelColor, 0.12));
        changeCss('.app__body .modal-tabs .nav-tabs > li, .app__body .system-notice, .app__body .file-view--single .file__image .image-loaded, .app__body .post .MenuWrapper .dropdown-menu button, .app__body .member-list__popover .more-modal__body, .app__body .alert.alert-transparent, .app__body .table > thead > tr > th, .app__body .table > tbody > tr > td', 'border-color:' + changeOpacity(theme.centerChannelColor, 0.12));
        changeCss('.app__body .post-list__arrows', 'fill:' + changeOpacity(theme.centerChannelColor, 0.3));
        changeCss('.app__body .post .card-icon__container', 'color:' + changeOpacity(theme.centerChannelColor, 0.3));
        changeCss('.app__body .post-image__details .post-image__download svg', 'stroke:' + changeOpacity(theme.centerChannelColor, 0.4));
        changeCss('.app__body .post-image__details .post-image__download svg', 'border-color:' + changeOpacity(theme.centerChannelColor, 0.35));
        changeCss('.app__body .channel-header__links .icon, .app__body .sidebar--right .sidebar--right__subheader .usage__icon, .app__body .more-modal__header svg, .app__body .icon--body', 'fill:' + theme.centerChannelColor);
        changeCss('@media(min-width: 768px){.app__body .post:hover .post__header .post-menu, .app__body .post.post--hovered .post__header .post-menu, .app__body .post.a11y--active .post__header .post-menu', 'border-color:' + changeOpacity(theme.centerChannelColor, 0.2));
        changeCss('.app__body .help-text, .app__body .post .post-waiting, .app__body .post.post--system .post__body', 'color:' + changeOpacity(theme.centerChannelColor, 0.6));
        changeCss('.app__body .nav-tabs, .app__body .nav-tabs > li.active > a, pp__body .input-group-addon, .app__body .app__content, .app__body .post-create__container .post-create-body .btn-file, .app__body .post-create__container .post-create-footer .msg-typing, .app__body .dropdown-menu, .app__body .popover, .app__body .suggestion-list__item .suggestion-list__ellipsis .suggestion-list__main, .app__body .tip-overlay, .app__body .form-control[disabled], .app__body .form-control[readonly], .app__body fieldset[disabled] .form-control', 'color:' + theme.centerChannelColor);
        changeCss('.app__body .post .post__link', 'color:' + changeOpacity(theme.centerChannelColor, 0.65));
        changeCss('.app__body #archive-link-home, .video-div .video-thumbnail__error', 'background:' + changeOpacity(theme.centerChannelColor, 0.15));
        changeCss('.app__body #post-create', 'color:' + theme.centerChannelColor);
        changeCss('.app__body .mentions--top', 'box-shadow:' + changeOpacity(theme.centerChannelColor, 0.2) + ' 1px -3px 12px');
        changeCss('.app__body .mentions--top', '-webkit-box-shadow:' + changeOpacity(theme.centerChannelColor, 0.2) + ' 1px -3px 12px');
        changeCss('.app__body .mentions--top', '-moz-box-shadow:' + changeOpacity(theme.centerChannelColor, 0.2) + ' 1px -3px 12px');
        changeCss('.app__body .shadow--2', 'box-shadow: 0 20px 30px 0' + changeOpacity(theme.centerChannelColor, 0.1) + ', 0 14px 20px 0 ' + changeOpacity(theme.centerChannelColor, 0.1));
        changeCss('.app__body .shadow--2', '-moz-box-shadow: 0  20px 30px 0 ' + changeOpacity(theme.centerChannelColor, 0.1) + ', 0 14px 20px 0 ' + changeOpacity(theme.centerChannelColor, 0.1));
        changeCss('.app__body .shadow--2', '-webkit-box-shadow: 0  20px 30px 0 ' + changeOpacity(theme.centerChannelColor, 0.1) + ', 0 14px 20px 0 ' + changeOpacity(theme.centerChannelColor, 0.1));
        changeCss('.app__body .shortcut-key, .app__body .post__body hr, .app__body .loading-screen .loading__content .round, .app__body .tutorial__circles .circle', 'background:' + theme.centerChannelColor);
        changeCss('.app__body .channel-header .heading', 'color:' + theme.centerChannelColor);
        changeCss('.app__body .markdown__table tbody tr:nth-child(2n)', 'background:' + changeOpacity(theme.centerChannelColor, 0.07));
        changeCss('.app__body .channel-header__info .header-dropdown__icon', 'color:' + changeOpacity(theme.centerChannelColor, 0.8));
        changeCss('.app__body .post-create__container .post-create-body .send-button.disabled i', 'color:' + changeOpacity(theme.centerChannelColor, 0.4));
        changeCss('.app__body .channel-header .pinned-posts-button svg', 'fill:' + changeOpacity(theme.centerChannelColor, 0.6));
        changeCss('.app__body .channel-header .channel-header_plugin-dropdown svg', 'fill:' + changeOpacity(theme.centerChannelColor, 0.6));
        changeCss('.app__body .file-preview, .app__body .post-image__details, .app__body .markdown__table th, .app__body .markdown__table td, .app__body .modal .settings-modal .settings-table .settings-content .divider-light, .app__body .webhooks__container, .app__body .dropdown-menu, .app__body .modal .modal-header', 'border-color:' + changeOpacity(theme.centerChannelColor, 0.2));
        changeCss('.emoji-picker .emoji-picker__header', 'border-color:' + changeOpacity(theme.centerChannelColor, 0.2));
        changeCss('.app__body .popover.bottom>.arrow', 'border-bottom-color:' + changeOpacity(theme.centerChannelColor, 0.25));
        changeCss('.app__body .btn.btn-transparent', 'color:' + changeOpacity(theme.centerChannelColor, 0.7));
        changeCss('.app__body .popover.right>.arrow', 'border-right-color:' + changeOpacity(theme.centerChannelColor, 0.25));
        changeCss('.app__body .popover.left>.arrow', 'border-left-color:' + changeOpacity(theme.centerChannelColor, 0.25));
        changeCss('.app__body .popover.top>.arrow', 'border-top-color:' + changeOpacity(theme.centerChannelColor, 0.25));
        changeCss('.app__body .popover .popover__row', 'border-color:' + changeOpacity(theme.centerChannelColor, 0.2));
        changeCss('body.app__body, .app__body .custom-textarea', 'color:' + theme.centerChannelColor);
        changeCss('.app__body .input-group-addon', 'border-color:' + changeOpacity(theme.centerChannelColor, 0.1));
        changeCss('@media(min-width: 768px){.app__body .post-list__table .post-list__content .dropdown-menu a:hover, .dropdown-menu > li > button:hover', 'background:' + changeOpacity(theme.centerChannelColor, 0.1));
        changeCss('.app__body .MenuWrapper .MenuItem > button:hover, .app__body .Menu .MenuItem > button:hover, .app__body .MenuWrapper .MenuItem > button:focus, .app__body .MenuWrapper .SubMenuItem > div:focus, .app__body .MenuWrapper .MenuItem > a:hover, .MenuItem > div:hover, .SubMenuItemContainer:not(.hasDivider):hover, .app__body .dropdown-menu div > a:focus, .app__body .dropdown-menu div > a:hover, .dropdown-menu li > a:focus, .app__body .dropdown-menu li > a:hover', 'background:' + changeOpacity(theme.centerChannelColor, 0.1));
        changeCss('.app__body .attachment .attachment__content, .app__body .attachment-actions button', 'border-color:' + changeOpacity(theme.centerChannelColor, 0.16));
        changeCss('.app__body .attachment-actions button:focus, .app__body .attachment-actions button:hover', 'border-color:' + changeOpacity(theme.centerChannelColor, 0.5));
        changeCss('.app__body .attachment-actions button:focus, .app__body .attachment-actions button:hover', 'background:' + changeOpacity(theme.centerChannelColor, 0.03));
        changeCss('.app__body .input-group-addon, .app__body .channel-intro .channel-intro__content, .app__body .webhooks__container', 'background:' + changeOpacity(theme.centerChannelColor, 0.05));
        changeCss('.app__body .date-separator .separator__text', 'color:' + theme.centerChannelColor);
        changeCss('.app__body .date-separator .separator__hr, .app__body .modal-footer, .app__body .modal .custom-textarea', 'border-color:' + changeOpacity(theme.centerChannelColor, 0.2));
        changeCss('.app__body .search-item-container', 'border-color:' + changeOpacity(theme.centerChannelColor, 0.1));
        changeCss('.app__body .modal .custom-textarea:focus', 'border-color:' + changeOpacity(theme.centerChannelColor, 0.3));
        changeCss('.app__body .channel-intro, .app__body .modal .settings-modal .settings-table .settings-content .divider-dark, .app__body hr, .app__body .modal .settings-modal .settings-table .settings-links, .app__body .modal .settings-modal .settings-table .settings-content .appearance-section .theme-elements__header, .app__body .user-settings .authorized-app:not(:last-child)', 'border-color:' + changeOpacity(theme.centerChannelColor, 0.2));
        changeCss('.app__body .post.post--comment.other--root.current--user .post-comment, .app__body pre', 'background:' + changeOpacity(theme.centerChannelColor, 0.05));
        changeCss('.app__body .post.post--comment.other--root.current--user .post-comment, .app__body .more-modal__list .more-modal__row, .app__body .member-div:first-child, .app__body .member-div, .app__body .access-history__table .access__report, .app__body .activity-log__table', 'border-color:' + changeOpacity(theme.centerChannelColor, 0.1));
        changeCss('@media(max-width: 1800px){.app__body .inner-wrap.move--left .post.post--comment.same--root', 'border-color:' + changeOpacity(theme.centerChannelColor, 0.07));
        changeCss('.app__body .post.post--hovered', 'background:' + changeOpacity(theme.centerChannelColor, 0.08));
        changeCss('.app__body .attachment__body__wrap.btn-close', 'background:' + changeOpacity(theme.centerChannelColor, 0.08));
        changeCss('.app__body .attachment__body__wrap.btn-close', 'border-color:' + changeOpacity(theme.centerChannelColor, 0.2));
        changeCss('@media(min-width: 768px){.app__body .post.a11y--active, .app__body .modal .settings-modal .settings-table .settings-content .section-min:hover', 'background:' + changeOpacity(theme.centerChannelColor, 0.08));
        changeCss('@media(min-width: 768px){.app__body .post.post--editing', 'background:' + changeOpacity(theme.buttonBg, 0.08));
        changeCss('@media(min-width: 768px){.app__body .post.current--user:hover .post__body ', 'background: transparent;');
        changeCss('.app__body .more-modal__row.more-modal__row--selected, .app__body .date-separator.hovered--before:after, .app__body .date-separator.hovered--after:before, .app__body .new-separator.hovered--after:before, .app__body .new-separator.hovered--before:after', 'background:' + changeOpacity(theme.centerChannelColor, 0.07));
        changeCss('@media(min-width: 768px){.app__body .dropdown-menu>li>a:focus, .app__body .dropdown-menu>li>a:hover', 'background:' + changeOpacity(theme.centerChannelColor, 0.15));
        changeCss('.app__body .form-control[disabled], .app__body .form-control[readonly], .app__body fieldset[disabled] .form-control', 'background:' + changeOpacity(theme.centerChannelColor, 0.1));
        changeCss('.app__body .sidebar--right', 'color:' + theme.centerChannelColor);
        changeCss('.app__body .modal .settings-modal .settings-table .settings-content .appearance-section .theme-elements__body', 'background:' + changeOpacity(theme.centerChannelColor, 0.05));

        changeCss('body', 'scrollbar-arrow-color:' + theme.centerChannelColor);
        changeCss('.app__body .post-create__container .post-create-body .btn-file svg, .app__body .post.post--compact .post-image__column .post-image__details svg, .app__body .modal .about-modal .about-modal__logo svg, .app__body .status svg, .app__body .edit-post__actions .icon svg', 'fill:' + theme.centerChannelColor);
        changeCss('.app__body .post-list__new-messages-below', 'background:' + changeColor(theme.centerChannelColor, 0.5));
        changeCss('.app__body .post.post--comment .post__body', 'border-color:' + changeOpacity(theme.centerChannelColor, 0.2));
        changeCss('@media(min-width: 768px){.app__body .post.post--compact.same--root.post--comment .post__content', 'border-color:' + changeOpacity(theme.centerChannelColor, 0.2));
        changeCss('.app__body .post.post--comment.current--user .post__body', 'border-color:' + changeOpacity(theme.centerChannelColor, 0.2));
        changeCss('.app__body .emoji-picker', 'color:' + theme.centerChannelColor);
        changeCss('.app__body .emoji-picker', 'border-color:' + changeOpacity(theme.centerChannelColor, 0.2));
        changeCss('.app__body .emoji-picker__search-icon', 'color:' + changeOpacity(theme.centerChannelColor, 0.4));
        changeCss('.app__body .emoji-picker__preview, .app__body .emoji-picker__items, .app__body .emoji-picker__search-container', 'border-color:' + changeOpacity(theme.centerChannelColor, 0.2));
        changeCss('.emoji-picker__category .fa:hover', 'color:' + changeOpacity(theme.centerChannelColor, 0.8));
        changeCss('.app__body .emoji-picker__item-wrapper:hover', 'background-color:' + changeOpacity(theme.centerChannelColor, 0.8));
        changeCss('.app__body .icon__postcontent_picker:hover', 'color:' + changeOpacity(theme.centerChannelColor, 0.8));
        changeCss('.app__body .emoji-picker .nav-tabs li a', 'fill:' + theme.centerChannelColor);
        changeCss('.app__body .post .post-collapse__show-more-button', `border-color:${changeOpacity(theme.centerChannelColor, 0.1)}`);
        changeCss('.app__body .post .post-collapse__show-more-line', `background-color:${changeOpacity(theme.centerChannelColor, 0.1)}`);

        if (theme.centerChannelBg) {
            const hoveredPostBg = blendColors(theme.centerChannelBg, theme.centerChannelColor, 0.04);
            const hoveredPostBgLight = blendColors(theme.centerChannelBg, theme.centerChannelColor, 0.04);

            // Fade out effect for collapsed posts that are being hovered over
            changeCss(
                '@media(min-width: 768px){.app__body .post-list__table .post:hover .post-collapse__gradient, ' +
                '.app__body .sidebar-right__body .post:hover .post-collapse__gradient, ' +
                '.app__body .ThreadPane .post:hover .post-collapse__gradient ',
                `background:linear-gradient(${changeOpacity(hoveredPostBg, 0)}, ${hoveredPostBg})`,
            );
            changeCss(
                '@media(min-width: 768px){.app__body .post-list__table .post:hover .post-collapse__show-more, ' +
                '.app__body .sidebar-right__body .post:hover .post-collapse__show-more, ' +
                '.app__body .ThreadPane .post:hover .post-collapse__show-more',
                `background:${hoveredPostBg}`,
            );
            changeCss(
                '@media(max-width: 768px){.app__body .post-list__table .post.current--user:hover .post-collapse__show-more',
                `background:${hoveredPostBgLight}`,
            );
            changeCss(
                '.app__body .post-list__table .post.post--hovered .post-collapse__gradient, ' +
                '.app__body .sidebar-right__body .post.post--hovered .post-collapse__gradient, ' +
                '.app__body .ThreadPane .post.post--hovered .post-collapse__gradient',
                `background:linear-gradient(${changeOpacity(hoveredPostBg, 0)}, ${hoveredPostBg})`,
            );
            changeCss(
                '.app__body .post-list__table .post.post--hovered .post-collapse__show-more, ' +
                '.app__body .sidebar-right__body .post.post--hovered .post-collapse__show-more, ' +
                '.app__body .ThreadPane .post.post--hovered .post-collapse__show-more',
                `background:${hoveredPostBg}`,
            );
        }
    }

    if (theme.newMessageSeparator) {
        changeCss('.app__body .new-separator .separator__text', 'color:' + theme.newMessageSeparator);
        changeCss('.app__body .new-separator .separator__hr', 'border-color:' + changeOpacity(theme.newMessageSeparator, 0.5));
    }

    if (theme.linkColor) {
        changeCss('.app__body .more-modal__list .a11y--focused, .app__body .post.a11y--focused, .app__body .channel-header.a11y--focused, .app__body .post-create.a11y--focused, .app__body .user-popover.a11y--focused, .app__body .post-message__text.a11y--focused, #archive-link-home>a.a11y--focused', 'box-shadow: inset 0 0 1px 3px ' + changeOpacity(theme.linkColor, 0.5) + ', inset 0 0 0 1px ' + theme.linkColor);
        changeCss('.app__body .a11y--focused', 'box-shadow: 0 0 1px 3px ' + changeOpacity(theme.linkColor, 0.5) + ', 0 0 0 1px ' + theme.linkColor);
        changeCss('.app__body .channel-header .channel-header__favorites.inactive:hover, .app__body .channel-header__links > a.active, .app__body a, .app__body a:focus, .app__body a:hover, .app__body .channel-header__links > .color--link.active, .app__body .color--link, .app__body a:focus, .app__body .color--link:hover, .app__body .btn, .app__body .btn:focus, .app__body .btn:hover', 'color:' + theme.linkColor);
        changeCss('.app__body .attachment .attachment__container', 'border-left-color:' + changeOpacity(theme.linkColor, 0.5));
        changeCss('.app__body .channel-header .channel-header_plugin-dropdown a:hover, .app__body .member-list__popover .more-modal__list .more-modal__row:hover', 'background:' + changeOpacity(theme.linkColor, 0.08));
        changeCss('.app__body .channel-header__links .icon:hover, .app__body .channel-header__links > a.active .icon, .app__body .post .post__reply', 'fill:' + theme.linkColor);
        changeCss('.app__body .channel-header__links .icon:hover, .app__body .post .card-icon__container.active svg, .app__body .post .post__reply', 'fill:' + theme.linkColor);
        changeCss('.app__body .channel-header .pinned-posts-button:hover svg', 'fill:' + changeOpacity(theme.linkColor, 0.6));
        changeCss('.app__body .member-list__popover .more-modal__actions svg', 'fill:' + theme.linkColor);
        changeCss('.app__body .modal-tabs .nav-tabs > li.active, .app__body .channel-header .channel-header_plugin-dropdown a:hover, .app__body .member-list__popover .more-modal__list .more-modal__row:hover', 'border-color:' + theme.linkColor);
        changeCss('.app__body .channel-header .channel-header_plugin-dropdown a:hover svg', 'fill:' + theme.linkColor);
        changeCss('.app__body .channel-header .dropdown-toggle:hover .heading, .app__body .channel-header .dropdown-toggle:hover .header-dropdown__icon, .app__body .channel-header__title .open .heading, .app__body .channel-header__info .channel-header__title .open .header-dropdown__icon, .app__body .channel-header__title .open .heading, .app__body .channel-header__info .channel-header__title .open .heading', 'color:' + theme.linkColor);
        changeCss('.emoji-picker__container .icon--emoji.active svg', 'fill:' + theme.linkColor);
        changeCss('.app__body .channel-header .channel-header_plugin-dropdown a:hover .fa', 'color:' + theme.linkColor);
        changeCss('.app__body .post .post-collapse__show-more', `color:${theme.linkColor}`);
        changeCss('.app__body .post .post-attachment-collapse__show-more', `color:${theme.linkColor}`);
        changeCss('.app__body .post .post-collapse__show-more-button:hover', `background-color:${theme.linkColor}`);
        changeCss('.app__body .post-message .group-mention-link', `color:${theme.linkColor}`);
    }

    if (theme.buttonBg) {
        changeCss('.app__body .modal .settings-modal .profile-img__remove:hover, .app__body .DayPicker:not(.DayPicker--interactionDisabled) .DayPicker-Day:not(.DayPicker-Day--disabled):not(.DayPicker-Day--selected):not(.DayPicker-Day--outside):hover:before, .app__body .modal .settings-modal .team-img__remove:hover, .app__body .btn.btn-transparent:hover, .app__body .btn.btn-transparent:active, .app__body .post-image__details .post-image__download svg:hover, .app__body .file-view--single .file__download:hover, .app__body .new-messages__button div, .app__body .btn.btn-primary, .app__body .tutorial__circles .circle.active', 'background:' + theme.buttonBg);
        changeCss('.app__body .system-notice__logo svg', 'fill:' + theme.buttonBg);
        changeCss('.app__body .post-image__details .post-image__download svg:hover', 'border-color:' + theme.buttonBg);
        changeCss('.app__body .btn.btn-primary:hover, .app__body .btn.btn-primary:active, .app__body .btn.btn-primary:focus', 'background:' + changeColor(theme.buttonBg, -0.15));
        changeCss('.app__body .emoji-picker .nav-tabs li.active a, .app__body .emoji-picker .nav-tabs li a:hover', 'fill:' + theme.buttonBg);
        changeCss('.app__body .emoji-picker .nav-tabs > li.active > a', 'border-bottom-color:' + theme.buttonBg + '!important;');
    }

    if (theme.buttonColor) {
        changeCss('.app__body .DayPicker:not(.DayPicker--interactionDisabled) .DayPicker-Day:not(.DayPicker-Day--disabled):not(.DayPicker-Day--selected):not(.DayPicker-Day--outside):hover, .app__body .modal .settings-modal .team-img__remove:hover, .app__body .btn.btn-transparent:hover, .app__body .btn.btn-transparent:active, .app__body .new-messages__button div, .app__body .btn.btn-primary', 'color:' + theme.buttonColor);
        changeCss('.app__body .new-messages__button svg', 'fill:' + theme.buttonColor);
        changeCss('.app__body .post-image__details .post-image__download svg:hover, .app__body .file-view--single .file__download svg', 'stroke:' + theme.buttonColor);
    }

    if (theme.errorTextColor) {
        changeCss('.app__body .error-text, .app__body .modal .settings-modal .settings-table .settings-content .has-error, .app__body .modal .input__help.error, .app__body .color--error, .app__body .has-error .help-block, .app__body .has-error .control-label, .app__body .has-error .radio, .app__body .has-error .checkbox, .app__body .has-error .radio-inline, .app__body .has-error .checkbox-inline, .app__body .has-error.radio label, .app__body .has-error.checkbox label, .app__body .has-error.radio-inline label, .app__body .has-error.checkbox-inline label', 'color:' + theme.errorTextColor);
    }

    if (theme.mentionHighlightBg) {
        changeCss('.app__body .mention--highlight, .app__body .search-highlight', 'background:' + theme.mentionHighlightBg);
        changeCss('.app__body .post.post--comment .post__body.mention-comment', 'border-color:' + theme.mentionHighlightBg);
        changeCss('.app__body .post.post--highlight', 'background:' + changeOpacity(theme.mentionHighlightBg, 0.5));
        changeCss('.app__body .post.post--highlight .post-collapse__gradient', 'background:' + changeOpacity(theme.mentionHighlightBg, 0.5));
        changeCss('.app__body .post.post--highlight .post-collapse__show-more', 'background:' + changeOpacity(theme.mentionHighlightBg, 0.5));
    }

    if (theme.mentionHighlightLink) {
        changeCss('.app__body .mention--highlight .mention-link, .app__body .mention--highlight, .app__body .search-highlight', 'color:' + theme.mentionHighlightLink);
        changeCss('.app__body .mention--highlight .mention-link > a, .app__body .mention--highlight > a, .app__body .search-highlight > a', 'color: inherit');
    }

    applyMonokaiCodeTheme();

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

// given '#fffff', returns '255, 255, 255' (no trailing comma)
function toRgbValues(hexStr: string) {
    const rgbaStr = `${parseInt(hexStr.substr(1, 2), 16)}, ${parseInt(hexStr.substr(3, 2), 16)}, ${parseInt(hexStr.substr(5, 2), 16)}`;
    return rgbaStr;
}

function dropAlpha(value: string) {
    return value.substr(value.indexOf('(') + 1).split(',', 3).join(',');
}
function changeCss(className: string, classValue: string) {
    let styleEl: HTMLStyleElement | null = document.querySelector('style[data-class="' + className + '"]');
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.setAttribute('data-class', className);

        // Append style element to head
        document.head.appendChild(styleEl);
    }

    // Grab style sheet
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const styleSheet = styleEl.sheet!;
    const rules: CSSRuleList = styleSheet.cssRules || styleSheet.rules;
    const style = classValue.substr(0, classValue.indexOf(':'));
    const value = classValue.substr(classValue.indexOf(':') + 1).replace(/!important[;]/g, '');
    // eslint-disable-next-line no-undefined
    const priority = classValue.match(/!important/) ? 'important' : undefined;

    for (let i = 0; i < rules.length; i++) {
        if ((rules[i] as CSSStyleRule).selectorText === className) {
            (rules[i] as CSSStyleRule).style.setProperty(style, value, priority);
            return;
        }
    }

    let mediaQuery = '';
    if (className.indexOf('@media') >= 0) {
        mediaQuery = '}';
    }
    try {
        styleSheet.insertRule(className + '{' + classValue + '}' + mediaQuery, styleSheet.cssRules.length);
    } catch (e) {
        console.error(e); // eslint-disable-line no-console
    }
}

function changeColor(colourIn: string, amt: number): string {
    let hex = colourIn;
    let lum = amt;

    // validate hex string
    hex = String(hex).replace(/[^0-9a-f]/gi, '');
    if (hex.length < 6) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    lum = lum || 0;

    // convert to decimal and change luminosity
    let rgb = '#';
    let c;
    let i;
    for (i = 0; i < 3; i++) {
        c = parseInt(hex.substr(i * 2, 2), 16);
        c = Math.round(Math.min(Math.max(0, c + (c * lum)), 255)).toString(16);
        rgb += ('00' + c).substr(c.length);
    }

    return rgb;
}

function applyMonokaiCodeTheme() {
    const link: HTMLLinkElement | null = document.querySelector('link.code_theme');
    if (link) {
        link.href = monokaiCSS;
    }
}

import React from 'react';
import {useIntl} from 'react-intl';
import {useSelector} from 'react-redux';
import {rtcdEnabled} from 'src/selectors';
import {untranslatable} from 'src/utils';

export const useHelptext = (propsHelpText: JSX.Element | null) => {
    const {formatMessage} = useIntl();
    const isRTCDEnabled = useSelector(rtcdEnabled);

    if (!isRTCDEnabled) {
        return propsHelpText;
    }

    const space = untranslatable(' ');

    // @ts-ignore
    const disabledPostfix = formatMessage({defaultMessage: 'Not applicable when the <link>RTCD service URL</link> field is in use.'},
        {link: (text: string) => <a href={'https://docs.mattermost.com/configure/plugins-configuration-settings.html#rtcd-service-url'}>{text}</a>});

    return (
        <>
            {propsHelpText}
            {space}
            {disabledPostfix}
        </>
    );
};

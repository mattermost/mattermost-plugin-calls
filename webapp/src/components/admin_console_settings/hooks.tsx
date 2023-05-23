import React from 'react';
import {useIntl} from 'react-intl';
import {useSelector} from 'react-redux';

import {rtcdEnabled} from 'src/selectors';
import {untranslatable} from 'src/utils';

export const useHelptext = (propsHelpText: JSX.Element | null) => {
    const {formatMessage} = useIntl();
    const isRTCDEnabled = useSelector(rtcdEnabled);

    const space = untranslatable(' ');
    const enabledPostfix = formatMessage({defaultMessage: 'Enabled because the <code>RTCD service URL</code> field is empty.'},
        {code: (text: string) => <code>{text}</code>});
    const disabledPostfix = formatMessage({defaultMessage: 'Disabled because the <code>RTCD service URL</code> field is non-empty.'},
        {code: (text: string) => <code>{text}</code>});

    return (
        <>
            {propsHelpText}
            {space}
            {isRTCDEnabled ? disabledPostfix : enabledPostfix}
        </>
    );
};

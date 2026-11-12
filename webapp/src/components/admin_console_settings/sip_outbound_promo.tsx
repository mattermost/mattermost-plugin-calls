// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {FormattedMessage} from 'react-intl';
import {EnterprisePill, Text, Title} from 'src/components/admin_console_settings/common';
import {VerticalSpacer} from 'src/components/shared';
import {untranslatable} from 'src/utils';

export default function SIPOutboundPromo() {
    return (
        <div
            className='config-section'
            data-testid={'calls-sip-outbound-promo'}
        >
            <div className='admin-console__wrapper'>
                <div className='admin-console__content'>
                    <div className='section-body'>
                        <Title>
                            <FormattedMessage defaultMessage={'Get access to outbound phone calls'}/>
                            <EnterprisePill>{untranslatable('Enterprise Advanced')}</EnterprisePill>
                        </Title>
                        <VerticalSpacer $size={8}/>
                        <Text>
                            <FormattedMessage
                                defaultMessage={'Allow users to dial external phone numbers from a call through a SIP bridge. <featureLink>Learn more about this feature</featureLink>.'}
                                values={{
                                    featureLink: (text: React.ReactNode) => (
                                        <a
                                            href='https://mattermost.com/pl/calls-outbound-dialing?utm_source=mattermost&utm_medium=in-product&utm_content=calls_sip_outbound_feature_discovery'
                                            target='_blank'
                                            rel='noreferrer'
                                        >
                                            {text}
                                        </a>),
                                }}
                            />
                        </Text>
                    </div>
                </div>
            </div>
        </div>
    );
}

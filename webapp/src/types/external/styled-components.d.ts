// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {CSSProp} from 'styled-components';

declare global {
    namespace JSX {
        interface IntrinsicAttributes {
            css?: CSSProp;
        }
    }
}

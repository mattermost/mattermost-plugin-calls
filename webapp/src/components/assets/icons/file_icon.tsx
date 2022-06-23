// Copyright (c) 2017-present Mattermost, Inc. All Rights Reserved.
// See License for license information.

import React from 'react';

const FileIcon = (props: React.PropsWithoutRef<JSX.IntrinsicElements['i']>): JSX.Element => (
    <i className={`icon icon-file-generic-outline icon-32 ${props.className}`}/>
);

export default FileIcon;

// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

export type SelectOption = {
    label: string;
    value: string;
};

export type DevicesSelectionProps = {
    deviceType: string;
    devices: MediaDeviceInfo[];
    hasError: boolean;
    onSelectionChange?: (opt: SelectOption) => void;
};

export type DevicesSelectionHandle = {
    getOption: () => SelectOption;
};

// Copyright (c) 2020-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import ReactSelect from 'react-select';
import styled from 'styled-components';

export type SelectOption = {
    label: string;
    value: string;
};

export type DevicesSelectionProps = {
    deviceType: string;
    devices: MediaDeviceInfo[];
    onSelectionChange?: (opt: SelectOption) => void;
};

export type DevicesSelectionHandle = {
    getOption: () => SelectOption;
};

export const StyledReactSelect = styled(ReactSelect)`
  width: 260px;
`;

export const SelectionWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

export const SelectLabel = styled.label`
  font-size: 14px;
  font-weight: 400;
  line-height: 20px;
  margin: 0;
`;

export const Description = styled.span`
  margin-top: 8px;
`;

export const Fieldset = styled.fieldset`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

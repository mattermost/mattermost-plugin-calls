import React from 'react';
import {isMac} from 'src/shortcuts';
import styled from 'styled-components';

type Props = {
    shortcut: string,
};

const macKeyToCharMap: {[key: string]: string} = {
    meta: '⌘',
    alt: '⌥',
};

export default function Shortcut(props: Props) {
    const keys = props.shortcut.split('+');

    const renderKeys = () => {
        return keys.map((key) => {
            let ch = '';
            if (isMac()) {
                ch = macKeyToCharMap[key];
            }
            if (!ch) {
                ch = key;
            }
            return (
                <Key key={`key-${ch}`}>{ch}</Key>
            );
        });
    };

    return (
        <StyledShortcut>
            {renderKeys()}
        </StyledShortcut>
    );
}

const Key = styled.span`
  display: flex;
  justify-content: center;
  align-items: center;
  text-transform: capitalize;
  padding: 2px 5px;
  border-radius: 4px;
  background-color: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.72);
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  margin: 0 2px;
`;

const StyledShortcut = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
`;

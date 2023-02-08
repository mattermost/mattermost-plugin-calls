import React from 'react';
import styled from 'styled-components';

export type Props = {
    text: string,
    textSize: number,
    icon: React.ReactNode,
    gap: number,
    iconFill?: string,
    bgColor?: string,
    margin?: string,
    padding?: string,
    loading?: boolean,
    color?: string,
}

export default function Badge(props: Props) {
    return (
        <Container
            bgColor={props.bgColor}
            size={props.textSize}
            margin={props.margin}
            padding={props.padding}
            color={props.color}
        >
            { props.loading &&
            <Spinner size={props.textSize}/>
            }
            { !props.loading &&
            <Icon fill={props.iconFill}>{props.icon}</Icon>
            }
            <Text gap={props.gap}>{props.text}</Text>
        </Container>
    );
}

type ContainerProps = {
    bgColor?: string,
    size: number,
    margin?: string,
    padding?: string,
    color?: string,
}

const Container = styled.div<ContainerProps>`
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: ${({bgColor}) => bgColor || 'transparent'};
  border-radius: 4px;
  margin: ${({margin}) => margin || 0};
  padding: ${({padding}) => padding || 0};
  font-size: ${({size}) => size}px;
  line-height: ${({size}) => size}px;
  color: ${({color}) => color || 'currentColor'};
`;

const Text = styled.span<{gap: number}>`
  font-weight: 600;
  margin-left: ${({gap}) => gap}px;
`;

const Icon = styled.div<{fill?: string}>`
  display: flex;
  fill: ${({fill}) => fill || 'currentColor'};
`;

const Spinner = styled.span<{size: number}>`
  width: ${({size}) => size}px;
  height: ${({size}) => size}px;
  border-radius: 50%;
  display: inline-block;
  border-top: 2px solid currentColor;
  border-right: 2px solid transparent;
  box-sizing: border-box;
  animation: spin 1s linear infinite;

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }
`;

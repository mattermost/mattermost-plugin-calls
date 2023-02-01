import {
    SimulcastLevel,
} from './types';

export const RTCConnFailedErr = new Error('rtc connection failed');

export const DefaultSimulcastScreenEncodings = [
    {rid: SimulcastLevel.Low, maxBitrate: 500 * 1000, maxFramerate: 5, scaleResolutionDownBy: 1.0} as RTCRtpEncodingParameters,
    {rid: SimulcastLevel.High, maxBitrate: 2500 * 1000, maxFramerate: 20, scaleResolutionDownBy: 1.0} as RTCRtpEncodingParameters,
];

export const FallbackScreenEncodings = [
    {maxBitrate: 1000 * 1000, maxFramerate: 10, scaleResolutionDownBy: 1.0} as RTCRtpEncodingParameters,
];

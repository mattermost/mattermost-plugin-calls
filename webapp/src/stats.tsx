import {AnalyticsVisualizationType, PluginAnalyticsRow} from '@mattermost/types/admin';
import {General} from 'mattermost-redux/constants';
import {isMinimumServerVersion} from 'mattermost-redux/utils/helpers';
import React from 'react';
import {defineMessage, FormattedMessage, MessageDescriptor} from 'react-intl';
import {CallsStats} from 'src/types/types';

export function convertStatsToPanels(data: CallsStats, serverVersion: string, translations: Record<string, string>): Record<string, PluginAnalyticsRow> {
    const stats: Record<string, PluginAnalyticsRow> = {};
    stats.total_calls = {
        visualizationType: AnalyticsVisualizationType.Count,
        name: <FormattedMessage defaultMessage='Total Calls'/>,
        icon: 'fa-phone',
        id: 'total_calls',
        value: data.total_calls,
    };

    stats.total_active_calls = {
        visualizationType: AnalyticsVisualizationType.Count,
        name: <FormattedMessage defaultMessage='Total Active Calls'/>,
        icon: 'fa-phone',
        id: 'total_active_calls',
        value: data.total_active_calls,
    };

    stats.total_active_sessions = {
        visualizationType: AnalyticsVisualizationType.Count,
        name: <FormattedMessage defaultMessage='Total Active Sessions'/>,
        icon: 'fa-desktop',
        id: 'total_active_sessions',
        value: data.total_active_sessions,
    };

    stats.avg_call_duration = {
        visualizationType: AnalyticsVisualizationType.Count,
        name: <FormattedMessage defaultMessage='Avg Call Duration (minutes)'/>,
        icon: 'fa-clock',
        id: 'avg_call_duration',
        value: Math.round((data.avg_duration / 60) * 100) / 100,
    };

    stats.avg_call_participants = {
        visualizationType: AnalyticsVisualizationType.Count,
        name: <FormattedMessage defaultMessage='Avg Call Participants'/>,
        icon: 'fa-users',
        id: 'avg_call_participants',
        value: Math.round(data.avg_participants),
    };

    if (isMinimumServerVersion(serverVersion, 9, 10)) {
        const lineChartStyle = {
            fillColor: 'rgba(151,187,205,0.2)',
            borderColor: 'rgba(151,187,205,1)',
            pointBackgroundColor: 'rgba(151,187,205,1)',
            pointBorderColor: '#fff',
            pointHoverBackgroundColor: '#fff',
            pointHoverBorderColor: 'rgba(151,187,205,1)',
        };

        stats.calls_by_day = {
            visualizationType: AnalyticsVisualizationType.LineChart,
            name: <FormattedMessage defaultMessage='Daily Calls'/>,
            id: 'calls_by_day',
            value: {
                labels: Object.keys(data.calls_by_day),
                datasets: [{
                    ...lineChartStyle,
                    data: Object.values(data.calls_by_day),
                }],
            },
        };

        stats.calls_by_month = {
            visualizationType: AnalyticsVisualizationType.LineChart,
            name: <FormattedMessage defaultMessage='Monthly Calls'/>,
            id: 'calls_by_month',
            value: {
                labels: Object.keys(data.calls_by_month),
                datasets: [{
                    ...lineChartStyle,
                    data: Object.values(data.calls_by_month),
                }],
            },
        };

        const channelLabelsMap: Record<string, MessageDescriptor> = {
            [General.DM_CHANNEL]: defineMessage({defaultMessage: 'Direct'}),
            [General.GM_CHANNEL]: defineMessage({defaultMessage: 'Group'}),
            [General.OPEN_CHANNEL]: defineMessage({defaultMessage: 'Public'}),
            [General.PRIVATE_CHANNEL]: defineMessage({defaultMessage: 'Private'}),
        };

        stats.calls_by_channel_type = {
            visualizationType: AnalyticsVisualizationType.DoughnutChart,
            name: <FormattedMessage defaultMessage='Calls by Channel Type'/>,
            id: 'calls_by_channel_type',
            value: {
                labels: Object.keys(data.calls_by_channel_type).map((t) => translations[channelLabelsMap[t].id!] ?? t),
                datasets: [{
                    data: Object.values(data.calls_by_channel_type),
                    backgroundColor: ['#46BFBD', '#FDB45C', '#3CB470', '#502D86'],
                    hoverBackgroundColor: ['#5AD3D1', '#FFC870', '#3CB470', '#502D86'],
                }],
            },
        };

        // Render call recordings panels only if we have something to show.
        if (Object.values(data.recording_jobs_by_day).some(val => val > 0)) {
            stats.recording_jobs_by_day = {
                visualizationType: AnalyticsVisualizationType.LineChart,
                name: <FormattedMessage defaultMessage='Daily Call Recordings'/>,
                id: 'calls_recording_jobs_by_day',
                value: {
                    labels: Object.keys(data.recording_jobs_by_day),
                    datasets: [{
                        ...lineChartStyle,
                        data: Object.values(data.recording_jobs_by_day),
                    }],
                },
            };

            stats.recording_jobs_by_month = {
                visualizationType: AnalyticsVisualizationType.LineChart,
                name: <FormattedMessage defaultMessage='Monthly Call Recordings'/>,
                id: 'calls_recording_jobs_by_month',
                value: {
                    labels: Object.keys(data.recording_jobs_by_month),
                    datasets: [{
                        ...lineChartStyle,
                        data: Object.values(data.recording_jobs_by_month),
                    }],
                },
            };
        }
    }

    return stats;
}

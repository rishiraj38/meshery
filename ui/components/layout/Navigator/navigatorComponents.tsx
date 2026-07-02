import React from 'react';
import { CatalogIcon, TachographDigitalIcon, InsertChartIcon } from '@sistent/sistent';
import ConfigurationIcon from '../../../assets/icons/ConfigurationIcon';
import ConnectionIcon from '../../../assets/icons/Connection';
import CredentialIcon from '../../../assets/icons/CredentialIcon';
import DashboardIcon from '@/assets/icons/DashboardIcon';
import EnvironmentIcon from '../../../assets/icons/Environment';
import ServiceMeshIcon from '../../../assets/icons/ServiceMeshIcon';
import WorkspaceOutlinedIcon from '../../../assets/icons/WorkspaceOutlined';
import LifecycleIcon from '../../../public/static/img/drawer-icons/lifecycle_mgmt_svg';
import PerformanceIcon from '../../../public/static/img/drawer-icons/performance_svg';
import ExtensionIcon from '../../../public/static/img/drawer-icons/extensions_svg';
import PatternIcon from '../../../public/static/img/drawer-icons/pattern_svg';
import LifecycleHover from '../../../public/static/img/drawer-icons/lifecycle_hover_svg';
import PerformanceHover from '../../../public/static/img/drawer-icons/performance_hover_svg';
import ConfigurationHover from '../../../public/static/img/drawer-icons/configuration_hover_svg';
import {
  CATALOG,
  CONFIGURATION,
  CONNECTION,
  CREDENTIAL,
  DASHBOARD,
  DESIGN,
  ENVIRONMENT,
  EXTENSIONS,
  GRAFANA,
  LIFECYCLE,
  PERFORMANCE,
  PROFILES,
  PROMETHEUS,
  SERVICE_MESH,
  TELEMETRY,
  WORKSPACE,
} from '../../../constants/navigator';
import { iconSmall } from '../../../css/icons.styles';
import { keys } from '@/utils/permission_constants';

export const drawerIconsStyle = {
  height: '19.36px',
  width: '19.36px',
  fontSize: '1.45rem',
  ...iconSmall,
};

export const getNavigatorComponents = (
  /** @type {ProviderUiAccessControl} */ providerUiAccessControl,
  theme,
) => [
  {
    id: DASHBOARD,
    icon: <DashboardIcon style={drawerIconsStyle} />,
    hovericon: <DashboardIcon style={drawerIconsStyle} />,
    href: '/',
    title: 'Dashboard',
    show: providerUiAccessControl.isNavigatorComponentEnabled([DASHBOARD]),
    link: true,
    submenu: true,
  },
  {
    id: LIFECYCLE,
    icon: <LifecycleIcon style={drawerIconsStyle} />,
    hovericon: <LifecycleHover style={drawerIconsStyle} />,
    title: 'Lifecycle',
    link: true,
    href: '/management/connections',
    show: providerUiAccessControl.isNavigatorComponentEnabled([LIFECYCLE]),
    submenu: true,
    children: [
      {
        id: CONNECTION,
        icon: <ConnectionIcon style={{ ...drawerIconsStyle }} />,
        href: '/management/connections',
        title: 'Connections',
        show: providerUiAccessControl.isNavigatorComponentEnabled([LIFECYCLE, CONNECTION]),
        link: true,
        permission: {
          action: keys.WorkspaceManagementViewConnections.action,
          subject: keys.WorkspaceManagementViewConnections.subject,
        },
      },
      {
        id: CREDENTIAL,
        icon: <CredentialIcon style={{ ...drawerIconsStyle }} />,
        href: '/management/credentials',
        title: 'Credentials',
        show: providerUiAccessControl.isNavigatorComponentEnabled([LIFECYCLE, CREDENTIAL]),
        link: true,
        permission: {
          action: keys.SecurityManagementViewCredentials.action,
          subject: keys.SecurityManagementViewCredentials.subject,
        },
      },
      {
        id: ENVIRONMENT,
        icon: <EnvironmentIcon style={{ ...drawerIconsStyle }} />,
        href: '/management/environments',
        title: 'Environments',
        show: providerUiAccessControl.isNavigatorComponentEnabled([LIFECYCLE, ENVIRONMENT]),
        link: true,
        permission: {
          action: keys.WorkspaceManagementViewEnvironment.action,
          subject: keys.WorkspaceManagementViewEnvironment.subject,
        },
      },
      {
        id: WORKSPACE,
        icon: <WorkspaceOutlinedIcon style={{ ...drawerIconsStyle }} />,
        href: '/management/workspaces',
        title: 'Workspaces',
        show: providerUiAccessControl.isNavigatorComponentEnabled([LIFECYCLE, WORKSPACE]),
        link: true,
        permission: {
          action: keys.WorkspaceManagementViewWorkspace.action,
          subject: keys.WorkspaceManagementViewWorkspace.subject,
        },
      },
      {
        id: SERVICE_MESH,
        href: '/management/adapter',
        title: 'Adapters',
        link: true,
        icon: <ServiceMeshIcon style={{ ...drawerIconsStyle }} />,
        show: true,
        permission: {
          action: keys.InfrastructureManagementViewCloudNativeInfrastructure.action,
          subject: keys.InfrastructureManagementViewCloudNativeInfrastructure.subject,
        },
      },
    ],
  },
  {
    id: CONFIGURATION,
    icon: <ConfigurationIcon {...drawerIconsStyle} />,
    hovericon: <ConfigurationHover style={drawerIconsStyle} />,
    href: '/configuration/designs',
    title: 'Configuration',
    show: providerUiAccessControl.isNavigatorComponentEnabled([CONFIGURATION]),
    link: true,
    submenu: true,
    children: [
      {
        id: CATALOG,
        icon: (
          <CatalogIcon
            primaryFill={
              window.location.pathname === '/configuration/catalog'
                ? theme.palette.background.constant.white
                : ''
            }
            secondaryFill={
              window.location.pathname === '/configuration/catalog'
                ? theme.palette.background.constant.white
                : ''
            }
            tertiaryFill="transparent"
            style={{ ...drawerIconsStyle }}
          />
        ),
        href: '/configuration/catalog',
        title: 'Catalog',
        show: providerUiAccessControl.isNavigatorComponentEnabled([CONFIGURATION, CATALOG]),
        link: true,
        isBeta: true,
        permission: {
          action: keys.CatalogManagementViewCatalog.action,
          subject: keys.CatalogManagementViewCatalog.subject,
        },
      },
      {
        id: DESIGN,
        icon: <PatternIcon style={{ ...drawerIconsStyle }} />,
        href: '/configuration/designs',
        title: 'Designs',
        show: providerUiAccessControl.isNavigatorComponentEnabled([CONFIGURATION, DESIGN]),
        link: true,
        isBeta: true,
        permission: {
          action: keys.CatalogManagementViewDesigns.action,
          subject: keys.CatalogManagementViewDesigns.subject,
        },
      },
    ],
  },
  {
    id: TELEMETRY,
    icon: <InsertChartIcon style={{ ...drawerIconsStyle }} fill={theme.palette.icon.default} />,
    hovericon: (
      <InsertChartIcon style={{ ...drawerIconsStyle }} fill={theme.palette.icon.default} />
    ),
    href: '/telemetry',
    title: 'Telemetry',
    show: providerUiAccessControl.isNavigatorComponentEnabled([TELEMETRY]),
    link: true,
    submenu: true,
    children: [
      {
        id: GRAFANA,
        icon: <InsertChartIcon style={{ ...drawerIconsStyle }} fill={theme.palette.icon.default} />,
        href: '/telemetry/charts',
        title: 'Charts',
        show: providerUiAccessControl.isNavigatorComponentEnabled([TELEMETRY, GRAFANA]),
        link: true,
      },
      {
        id: PROMETHEUS,
        icon: <TachographDigitalIcon fill={theme.palette.icon.default} style={drawerIconsStyle} />,
        href: '/telemetry/metrics',
        title: 'Metrics',
        show: providerUiAccessControl.isNavigatorComponentEnabled([TELEMETRY, PROMETHEUS]),
        link: true,
      },
    ],
  },
  {
    id: PERFORMANCE,
    icon: <PerformanceIcon style={{ transform: 'scale(1.3)', ...drawerIconsStyle }} />,
    hovericon: <PerformanceHover style={drawerIconsStyle} />,
    href: '/performance',
    title: 'Performance',
    show: providerUiAccessControl.isNavigatorComponentEnabled([PERFORMANCE]),
    link: true,
    submenu: true,
    children: [
      {
        id: PROFILES,
        icon: <TachographDigitalIcon fill={theme.palette.icon.default} />,
        href: '/performance/profiles',
        title: 'Profiles',
        show: providerUiAccessControl.isNavigatorComponentEnabled([PERFORMANCE, PROFILES]),
        link: true,
        permission: {
          action: keys.PerformanceManagementViewPerformanceProfiles.action,
          subject: keys.PerformanceManagementViewPerformanceProfiles.subject,
        },
      },
    ],
  },
  {
    id: EXTENSIONS,
    icon: <ExtensionIcon style={drawerIconsStyle} />,
    hovericon: <ExtensionIcon style={drawerIconsStyle} />,
    title: 'Extensions',
    show: providerUiAccessControl.isNavigatorComponentEnabled([EXTENSIONS]),
    width: 12,
    link: true,
    href: '/extensions',
    submenu: false,
    permission: {
      action: keys.ExtensibilityViewExtensions.action,
      subject: keys.ExtensibilityViewExtensions.subject,
    },
  },
];

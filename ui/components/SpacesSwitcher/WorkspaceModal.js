import React, { useContext, useState, useEffect } from 'react';
import {
  ModalBody,
  useTheme,
  WorkspaceIcon,
  List,
  IconButton,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Box,
  DesignIcon,
  ViewIcon,
  useMediaQuery,
  Divider,
  ErrorBoundary,
  CustomTooltip,
} from '@sistent/sistent';
import { WorkspacesComponent } from '../Lifecycle';
import { iconMedium, iconSmall } from 'css/icons.styles';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import AccessTimeFilledIcon from '@mui/icons-material/AccessTimeFilled';
import MyViewsContent from './MyViewsContent';
import MyDesignsContent from './MyDesignsContent';
import RecentContent from './RecentContent';
import { useGetWorkspacesQuery } from '../../rtk-query/workspace';
import { DrawerHeader, StyledDrawer, StyledMainContent, StyledModal } from './styles';
import WorkspaceContent from './WorkspaceContent';
import { useGetProviderCapabilitiesQuery, useGetSelectedOrganization } from '@/rtk-query/user';
import PeopleIcon from '@mui/icons-material/People';
import SharedContent from './SharedContent';
import CAN from '@/utils/can';
import { keys } from '@/utils/permission_constants';
import { WorkspaceModalContext } from '@/utils/context/WorkspaceModalContextProvider';

const getNavItem = (theme) => {
  return [
    {
      id: 'Recents (Global)',
      label: 'Recents (Global)',
      icon: <AccessTimeFilledIcon />,
      content: <RecentContent />,
    },
    {
      id: 'My-Designs',
      label: 'My Designs',
      icon: (
        <DesignIcon
          fill={theme.palette.icon.default}
          secondaryFill={theme.palette.icon.default}
          {...iconSmall}
          primaryFill={theme.palette.icon.default}
        />
      ),
      content: <MyDesignsContent />,
    },
    {
      id: 'My-Views',
      label: 'My Views',
      icon: <ViewIcon {...iconSmall} fill={theme.palette.icon.default} />,
      enabled: CAN(keys.VIEW_VIEWS.action, keys.VIEW_VIEWS.subject),
      content: <MyViewsContent />,
    },
    {
      id: 'Shared-With-Me',
      label: 'Shared With Me',
      icon: <PeopleIcon {...iconSmall} />,
      content: <SharedContent />,
    },
  ];
};

const NavItem = ({ item, open, selectedId, onSelect }) => {
  const { setMultiSelectedContent } = useContext(WorkspaceModalContext);
  return (
    <CustomTooltip title={item.label} disableHoverListener={open} placement="right">
      <ListItem disablePadding sx={{ display: 'block' }}>
        <ListItemButton
          selected={selectedId === item.id}
          onClick={() => {
            setMultiSelectedContent([]);
            onSelect(item.id);
          }}
          sx={{
            minHeight: 48,
            px: 2.5,
            justifyContent: open ? 'initial' : 'center',
          }}
        >
          <ListItemIcon
            sx={{
              minWidth: 0,
              justifyContent: 'center',
              mr: open ? 3 : 'auto',
            }}
          >
            {item.icon}
          </ListItemIcon>
          <ListItemText primary={item.label} sx={{ opacity: open ? 1 : 0 }} />
        </ListItemButton>
      </ListItem>
    </CustomTooltip>
  );
};

const WorkspacesSection = ({ open, selectedId, onSelect, workspacesData, isLoading }) => {
  const theme = useTheme();

  const handleWorkspacesClick = () => {
    onSelect('All Workspaces');
  };

  const workspaces = workspacesData?.workspaces?.map((workspace) => ({
    id: workspace.id,
    name: workspace.name,
    icon: (
      <WorkspaceIcon
        fill={theme.palette.icon.default}
        secondaryFill={theme.palette.icon.default}
        {...iconSmall}
      />
    ),
  }));
  const { setMultiSelectedContent } = useContext(WorkspaceModalContext);
  return (
    <>
      <CustomTooltip title={'All Workspaces'} disableHoverListener={open} placement="right">
        <ListItem disablePadding sx={{ display: 'block' }}>
          <ListItemButton
            selected={selectedId === 'All Workspaces'}
            onClick={handleWorkspacesClick}
            sx={{
              minHeight: 48,
              px: 2.5,
              justifyContent: open ? 'initial' : 'center',
            }}
          >
            <ListItemIcon
              sx={{
                minWidth: 0,
                justifyContent: 'center',
                mr: open ? 3 : 'auto',
              }}
            >
              <WorkspaceIcon
                fill={theme.palette.icon.default}
                secondaryFill={theme.palette.icon.default}
                {...iconSmall}
              />
            </ListItemIcon>
            <ListItemText primary="All Workspaces" sx={{ opacity: open ? 1 : 0 }} />
          </ListItemButton>
        </ListItem>
      </CustomTooltip>
      {isLoading ? (
        <ListItem sx={{ pl: 4 }}>
          <ListItemText primary="Loading..." />
        </ListItem>
      ) : (
        workspaces &&
        workspaces.map((workspace) => (
          <CustomTooltip
            title={workspace.name}
            disableHoverListener={open}
            placement="right"
            key={workspace.id}
          >
            <ListItem
              key={workspace.id}
              disablePadding
              sx={{ display: 'block', backgroundColor: theme.palette.background.secondary }}
            >
              <ListItemButton
                selected={selectedId === workspace.id}
                onClick={() => {
                  setMultiSelectedContent([]);
                  onSelect(workspace.id);
                }}
                sx={{
                  minHeight: 48,
                  px: 2.5,
                  pl: open ? '2.5rem' : undefined,
                  justifyContent: open ? 'initial' : 'center',
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: 0,
                    justifyContent: 'center',
                    mr: open ? 3 : 'auto',
                  }}
                >
                  {workspace.icon}
                </ListItemIcon>
                <ListItemText primary={workspace.name} sx={{ opacity: open ? 1 : 0 }} />
              </ListItemButton>
            </ListItem>
          </CustomTooltip>
        ))
      )}
    </>
  );
};

const WorkspaceContentWrapper = ({ id, workspacesData, onSelectWorkspace }) => {
  const workspaceSwitcherContext = useContext(WorkspaceModalContext);
  const theme = useTheme();

  useEffect(() => {
    if (id === 'All Workspaces') {
      workspaceSwitcherContext.setSelectedWorkspace({
        id: null,
        name: null,
      });
    }
  }, [id, workspacesData]);

  const navConfig = getNavItem(theme);
  const mainItem = navConfig.find((item) => item.id === id);

  if (mainItem && mainItem.content) {
    return mainItem.content;
  }
  if (id === 'All Workspaces') {
    return <WorkspacesComponent onSelectWorkspace={onSelectWorkspace} />;
  }

  const foundWorkspace = workspacesData?.workspaces?.find((workspace) => workspace.id === id);
  if (foundWorkspace) {
    return <WorkspaceContent workspace={foundWorkspace} />;
  }

  return <RecentContent />;
};

const Navigation = ({ setHeaderInfo }) => {
  const theme = useTheme();
  const closeList = useMediaQuery(theme.breakpoints.down('xl'));
  const [open, setOpen] = useState(!closeList);
  const { data: capabilitiesData } = useGetProviderCapabilitiesQuery();
  const isLocalProvider = capabilitiesData?.provider_type === 'local';
  const workspaceSwitcherContext = useContext(WorkspaceModalContext);
  const { selectedWorkspace } = workspaceSwitcherContext;
  const [selectedId, setSelectedId] = useState(selectedWorkspace?.id || 'Recents (Global)');
  const navConfig = getNavItem(theme).filter((item) => item.enabled !== false);
  const { selectedOrganization } = useGetSelectedOrganization();
  const { data: workspacesData, isLoading } = useGetWorkspacesQuery(
    {
      page: 0,
      pagesize: 'all',
      order: 'updated_at desc',
      orgID: selectedOrganization?.id,
    },
    {
      skip: !selectedOrganization?.id,
    },
  );
  const onSelectWorkspace = ({ id, name }) => {
    setSelectedId(id);
    workspaceSwitcherContext.setSelectedWorkspace({
      id: id,
      name: name,
    });
  };
  useEffect(() => {
    setOpen(!closeList);
  }, [closeList]);

  const handleDrawerToggle = () => {
    setOpen(!open);
  };

  const updateHeaderInfo = (id) => {
    const mainItem = navConfig.find((item) => item.id === id);

    if (mainItem) {
      setHeaderInfo({
        title: mainItem.label,
        icon: mainItem.icon,
      });
    } else if (id === 'All Workspaces') {
      setHeaderInfo({
        title: 'All Workspaces',
        icon: <WorkspaceIcon {...iconMedium} secondaryFill={theme.palette.icon.neutral.default} />,
      });
    } else {
      const foundWorkspace = workspacesData?.workspaces?.find((workspace) => workspace.id === id);
      if (foundWorkspace) {
        setHeaderInfo({
          title: `Workspace "${foundWorkspace.name}"`,
          icon: (
            <WorkspaceIcon {...iconMedium} secondaryFill={theme.palette.icon.neutral.default} />
          ),
        });
      }
    }
  };

  const handleItemSelect = (id) => {
    setSelectedId(id);
    updateHeaderInfo(id);
  };

  // Set initial header info on component mount or when data changes
  useEffect(() => {
    updateHeaderInfo(selectedId);
  }, [selectedId, workspacesData, theme]);

  return (
    <Box sx={{ display: 'flex', position: 'relative', height: '100%' }}>
      <ErrorBoundary>
        <StyledDrawer
          variant="permanent"
          open={open}
          sx={{
            '& .MuiDrawer-paper': {
              position: 'relative',
              height: '100%',
            },
          }}
        >
          <List>
            {!isLocalProvider &&
              navConfig.map((item) => (
                <NavItem
                  key={item.id}
                  item={item}
                  open={open}
                  selectedId={selectedId}
                  onSelect={handleItemSelect}
                />
              ))}
            <Divider
              sx={{
                marginBlock: '0.5rem',
              }}
            />
            <WorkspacesSection
              open={open}
              selectedId={selectedId}
              onSelect={handleItemSelect}
              workspacesData={workspacesData}
              isLoading={isLoading}
            />
          </List>

          <DrawerHeader open={open}>
            <IconButton onClick={handleDrawerToggle}>
              {open ? <ChevronLeftIcon /> : <ChevronRightIcon />}
            </IconButton>
          </DrawerHeader>
        </StyledDrawer>
      </ErrorBoundary>
      <ErrorBoundary>
        <StyledMainContent>
          <WorkspaceContentWrapper
            id={selectedId}
            workspacesData={workspacesData}
            onSelectWorkspace={onSelectWorkspace}
          />
        </StyledMainContent>
      </ErrorBoundary>
    </Box>
  );
};

const WorkspaceModal = ({ workspaceModal, closeWorkspaceModal }) => {
  const theme = useTheme();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('md'));
  const [headerInfo, setHeaderInfo] = useState({
    title: 'All Workspaces',
    icon: <WorkspaceIcon {...iconMedium} secondaryFill={theme.palette.icon.neutral.default} />,
  });

  return (
    <StyledModal
      closeModal={closeWorkspaceModal}
      open={workspaceModal}
      headerIcon={headerInfo.icon}
      title={headerInfo.title}
      isFullScreenModeAllowed={!isSmallScreen}
    >
      <ModalBody style={{ height: '100%', padding: '0' }}>
        {workspaceModal && <Navigation setHeaderInfo={setHeaderInfo} />}
      </ModalBody>
    </StyledModal>
  );
};

export default WorkspaceModal;

import React, { useEffect } from 'react';
import { FavoriteIcon, Hidden, Typography, useTheme } from '@sistent/sistent';
import Navigator from './layout/Navigator/Navigator';
import CAN from '@/utils/can';
import { Keys } from '@meshery/schemas/permissions';
import { useDispatch, useSelector } from 'react-redux';
import { connectionsToK8sContexts } from '@/rtk-query/transforms';
import { useGetConnectionsQuery } from '@/rtk-query/connection';
import { CONNECTION_KINDS } from '@/utils/Enum';
import { setK8sContexts, updateK8SConfig } from '@/store/slices/mesheryUi';
import { loadSelectedK8sContexts } from '@/utils/multi-ctx';
import { store } from '@/store';
import { StyledDrawer, StyledFooterBody, StyledFooterText } from '../themes/App.styles';

type FooterProps = {
  providerCapabilities?: { restrictedAccess?: { isMesheryUiRestricted?: boolean } } | null;
  handleMesheryCommunityClick: () => void;
};

export const Footer = ({ providerCapabilities, handleMesheryCommunityClick }: FooterProps) => {
  const theme = useTheme();
  const isPlaygroundBuild = process.env.NEXT_PUBLIC_PLAYGROUND_BUILD === 'true';
  const { extensionType: extension } = useSelector((state) => state.ui);

  if (extension === 'navigator') {
    return null;
  }

  return (
    <StyledFooterBody>
      <Typography
        variant="body2"
        align="center"
        component="p"
        style={{
          color:
            theme.palette.mode === 'light'
              ? theme.palette.text.default
              : theme.palette.text.disabled,
        }}
      >
        <StyledFooterText onClick={handleMesheryCommunityClick}>
          {providerCapabilities?.restrictedAccess?.isMesheryUIRestricted || isPlaygroundBuild ? (
            'ACCESS LIMITED IN MESHERY PLAYGROUND. DEPLOY MESHERY TO ACCESS ALL FEATURES.'
          ) : (
            <>
              {' '}
              Built with{' '}
              <FavoriteIcon
                fill={theme.palette.background.brand.default}
                style={{
                  display: 'inline',
                  verticalAlign: 'bottom',
                }}
              />{' '}
              by the Meshery Community
            </>
          )}
        </StyledFooterText>
      </Typography>
    </StyledFooterBody>
  );
};

type SetAppState = (partial: Record<string, unknown>) => void;

// KubernetesSubscription keeps the app-wide k8s context list (k8sConfig) in sync
// with the user's kubernetes connections. It replaces the subscribeK8sContext
// GraphQL subscription: the list is now driven by the connections REST API
// (kind=kubernetes) and stays fresh via RTK Query cache invalidation — every
// connection mutation invalidates the `Connection_API_Connections` tag, which
// refetches this query. Everything is connection-driven.
export const KubernetesSubscription = ({ setAppState }: { setAppState: SetAppState }) => {
  const dispatch = useDispatch();
  const canViewClusters = CAN(
    Keys.IdentityAccessManagementViewAllKubernetesClusters.id,
    Keys.IdentityAccessManagementViewAllKubernetesClusters.function,
  );

  const { data: connectionData } = useGetConnectionsQuery(
    // Filter by kind via a plain repeated query param (?kind=kubernetes);
    // pageSize=all fetches every cluster in one shot.
    { kind: CONNECTION_KINDS.KUBERNETES, pageSize: 'all' },
    { skip: !canViewClusters },
  );

  useEffect(() => {
    if (!canViewClusters) {
      return;
    }

    const normalizedK8sContext = connectionsToK8sContexts(connectionData?.connections);
    const availableIds: string[] = (normalizedK8sContext?.contexts ?? []).map(
      (ctx: { id: string }) => ctx.id,
    );
    const allContexts: string[] = availableIds.length > 0 ? [...availableIds, 'all'] : [];

    // Honor the selection persisted for this browser session instead of
    // force-selecting every context on each refetch of the connections query
    // (which previously wiped the user's include/exclude choices on every
    // navigation-triggered cache refresh).
    const persisted = loadSelectedK8sContexts();
    let activeContexts = allContexts;
    if (persisted !== null && !persisted.includes('all')) {
      const valid = persisted.filter((id) => availableIds.includes(id));
      if (valid.length === availableIds.length || (valid.length === 0 && persisted.length > 0)) {
        // Every context is selected (restore the implicit 'all'), or every
        // persisted id is stale (contexts were replaced) — default to all.
        activeContexts = allContexts;
      } else {
        // Partial selection — includes the explicit "none selected" case.
        activeContexts = valid;
      }
    }

    setAppState({
      k8sContexts: normalizedK8sContext,
      activeK8sContexts: activeContexts,
    });

    dispatch(updateK8SConfig({ k8sConfig: normalizedK8sContext?.contexts ?? [] }));

    // Keep the redux selection (what dashboards, deploys, and queries consume)
    // in step with the restored selection; redux boots with ['all'] and would
    // otherwise disagree with the header checkboxes after a reload.
    const resolvedSelection = activeContexts.includes('all') ? ['all'] : activeContexts;
    const currentSelection = store.getState().ui.selectedK8sContexts;
    if (JSON.stringify(currentSelection) !== JSON.stringify(resolvedSelection)) {
      dispatch(setK8sContexts({ selectedK8sContexts: resolvedSelection }));
    }
  }, [connectionData, canViewClusters, dispatch, setAppState]);

  return null;
};

type NavigationBarProps = {
  isDrawerCollapsed: boolean;
  mobileOpen: boolean;
  handleDrawerToggle: () => void;
  updateExtensionType: (type: string | null) => void;
  canShowNav: boolean;
};

export const NavigationBar = ({
  isDrawerCollapsed,
  mobileOpen,
  handleDrawerToggle,
  updateExtensionType,
  canShowNav,
}: NavigationBarProps) => {
  if (!canShowNav) {
    return null;
  }

  return (
    <StyledDrawer
      isDrawerCollapsed={isDrawerCollapsed}
      data-testid="navigation"
      id="left-navigation-bar"
    >
      <Hidden smUp implementation="js">
        <Navigator
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          isDrawerCollapsed={isDrawerCollapsed}
          updateExtensionType={updateExtensionType}
        />
      </Hidden>
      <Hidden xsDown implementation="css">
        <Navigator
          isDrawerCollapsed={isDrawerCollapsed}
          updateExtensionType={updateExtensionType}
        />
      </Hidden>
    </StyledDrawer>
  );
};

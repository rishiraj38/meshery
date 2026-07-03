import React from 'react';
import { IconButton, CustomTooltip, InfoIcon, Typography, Box } from '@sistent/sistent';
import { getPermissionMetadata } from '@/utils/permission_constants';

export interface PermissionInfoProps {
  permissionId: string;
  placement?:
    | 'bottom-end'
    | 'bottom-start'
    | 'bottom'
    | 'left-end'
    | 'left-start'
    | 'left'
    | 'right-end'
    | 'right-start'
    | 'right'
    | 'top-end'
    | 'top-start'
    | 'top';
  icon?: React.ReactNode;
  iconSize?: 'small' | 'medium' | 'large';
  style?: React.CSSProperties;
}

/**
 * Reusable presentation-only component to display permission information for disabled actions.
 * Parent components control when to render this component (e.g. when the button is disabled).
 */
export const PermissionInfo: React.FC<PermissionInfoProps> = ({
  permissionId,
  placement = 'top',
  icon,
  iconSize = 'small',
  style,
}) => {
  const metadata = getPermissionMetadata(permissionId);
  const displayName = metadata?.function || 'Action';
  const description = metadata?.description || '';

  const tooltipContent = (
    <Box sx={{ p: 0.5 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
        {displayName}
      </Typography>
      {description && (
        <Typography variant="body2" sx={{ mb: 0.5, opacity: 0.9 }}>
          {description}
        </Typography>
      )}
      <Typography variant="caption" sx={{ display: 'block', color: 'warning.main', mt: 0.5 }}>
        Access is unavailable because the required permission is not assigned.
      </Typography>
    </Box>
  );

  return (
    <CustomTooltip title={tooltipContent} placement={placement} interactive>
      <Box
        component="span"
        style={style}
        sx={{
          display: 'inline-flex',
          verticalAlign: 'middle',
        }}
      >
        <IconButton
          size={iconSize}
          aria-label={`Permission details for ${displayName}`}
          sx={{
            padding: '4px',
            color: 'text.secondary',
            '&:hover': {
              color: 'info.main',
            },
          }}
        >
          {icon || <InfoIcon width={16} height={16} />}
        </IconButton>
      </Box>
    </CustomTooltip>
  );
};

export default PermissionInfo;

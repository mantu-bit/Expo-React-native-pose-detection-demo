# GitHub Workflows for Human Pose Detection Demo

This directory contains GitHub Actions workflows for building and deploying the Human Pose Detection Demo app.

## Available Workflows

### `build-android-apk.yml` - Build & Auto Release Android APK

**Triggers:**

- Manual dispatch only with build type selection

**Features:**

- Builds APK for development, staging, and production environments
- Automatic version tagging based on git tags
- GitHub release creation with generated changelog
- APK artifacts uploaded to GitHub releases
- Build logs and reports for troubleshooting
- Environment-specific builds with proper naming

**Manual Trigger Options:**

- `development` - Development build with dev API endpoints
- `staging` - Staging build with staging API endpoints
- `production` - Production build with production API endpoints

## Setup Requirements

### GitHub Secrets

Add these secrets to your repository settings:

```
EXPO_TOKEN - Your Expo authentication token (for EAS builds)
```

### Environment Variables

The workflows use these environment variables (configured in `eas.json`):

- `EXPO_PUBLIC_BASE_URL` - API base URL
- `EXPO_PUBLIC_SOCKET_URL` - WebSocket URL

## Usage

### Manual Builds

1. Go to Actions tab in GitHub
2. Select "Build & Auto Release Android APK" workflow
3. Click "Run workflow"
4. Choose build type (development, staging, or production)
5. Click "Run workflow"

### Downloading APKs

1. Go to the Releases section in GitHub
2. Find the latest release (automatically created by the workflow)
3. Download the APK from the release assets
4. APKs are available permanently in releases

## Build Artifacts

### APK Files

- `pose_detection_{build_type}_{version}.apk` - Main APK artifact in GitHub releases
- Build logs available in Actions artifacts for 7 days

### Build Logs

- `build-logs-{build-type}-{commit-sha}` - Build logs and reports (7 days retention)

## Troubleshooting

### Common Issues

1. **Build Failures**

   - Check build logs in the Actions tab
   - Ensure all dependencies are properly configured
   - Verify Android SDK setup

2. **Permission Issues**

   - Ensure GitHub Actions has proper permissions
   - Check repository secrets configuration

3. **Cache Issues**
   - Clear caches by updating the cache key
   - Force rebuild without cache if needed

### Performance Tips

- Cache dependencies are automatically managed
- Builds are optimized with Gradle caching
- Only manual builds are supported for controlled releases

## Pose Detection Specific Notes

- Custom Expo modules require development builds
- MediaPipe dependencies are handled automatically
- Camera permissions are configured in the app manifest
- Frame processing optimizations are included in the build

## Support

For issues with the workflows:

1. Check the Actions tab for detailed logs
2. Review the workflow configuration
3. Ensure all required secrets are configured
4. Verify environment variables are set correctly

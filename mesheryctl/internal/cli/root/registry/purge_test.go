// # Copyright Meshery Authors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package registry

import (
	"os"
	"path/filepath"
	"sort"
	"testing"

	"github.com/meshery/meshery/mesheryctl/pkg/utils"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// buildModelDir creates modelsDir/name containing one directory per entry in
// versionDirs plus one empty file per entry in extraFiles (used to simulate
// stray non-version entries like model_template.json or .DS_Store).
func buildModelDir(t *testing.T, modelsDir, name string, versionDirs, extraFiles []string) {
	t.Helper()
	modelPath := filepath.Join(modelsDir, name)
	require.NoError(t, os.MkdirAll(modelPath, 0o755))
	for _, v := range versionDirs {
		require.NoError(t, os.MkdirAll(filepath.Join(modelPath, v, "v1.0.0"), 0o755))
	}
	for _, f := range extraFiles {
		require.NoError(t, os.WriteFile(filepath.Join(modelPath, f), []byte("x"), 0o644))
	}
}

func sorted(ss []string) []string {
	out := append([]string(nil), ss...)
	sort.Strings(out)
	return out
}

func TestPlanModelVersions(t *testing.T) {
	tests := []struct {
		name       string
		versions   []string
		extraFiles []string
		retain     int
		wantRetain []string
		wantRemove []string
	}{
		{
			name:       "prereleases sort by real semver, not lexically",
			versions:   []string{"v1.35.0", "v1.35.0-alpha.1", "v1.35.0-alpha.2", "v1.35.0-beta.0", "v1.35.0-rc.0", "v1.35.0-rc.1", "v1.36.0"},
			retain:     1,
			wantRetain: []string{"v1.36.0"},
			wantRemove: []string{"v1.35.0-alpha.1", "v1.35.0-alpha.2", "v1.35.0-beta.0", "v1.35.0-rc.0", "v1.35.0-rc.1", "v1.35.0"},
		},
		{
			name:       "retain N keeps the N most recent",
			versions:   []string{"v1.0.0", "v1.1.0", "v1.2.0", "v1.3.0"},
			retain:     2,
			wantRetain: []string{"v1.2.0", "v1.3.0"},
			wantRemove: []string{"v1.0.0", "v1.1.0"},
		},
		{
			name:       "mixed v-prefix and bare versions parse together",
			versions:   []string{"0.7.1", "0.7.2", "v0.8.0"},
			retain:     1,
			wantRetain: []string{"v0.8.0"},
			wantRemove: []string{"0.7.1", "0.7.2"},
		},
		{
			name:       "non-version file and directory entries are left untouched",
			versions:   []string{"v1.0.0", "v1.1.0"},
			extraFiles: []string{"model_template.json", ".DS_Store"},
			retain:     1,
			wantRetain: []string{"v1.1.0"},
			wantRemove: []string{"v1.0.0"},
		},
		{
			name:       "single version model is left untouched",
			versions:   []string{"v1.18.2"},
			retain:     1,
			wantRetain: []string{"v1.18.2"},
			wantRemove: nil,
		},
		{
			name:       "zero parseable version directories",
			versions:   nil,
			extraFiles: []string{"model_template.json"},
			retain:     1,
			wantRetain: nil,
			wantRemove: nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			modelsDir := t.TempDir()
			buildModelDir(t, modelsDir, "some-model", tt.versions, tt.extraFiles)

			retain, remove, err := planModelVersions(filepath.Join(modelsDir, "some-model"), tt.retain)
			require.NoError(t, err)
			assert.Equal(t, sorted(tt.wantRetain), sorted(retain))
			assert.Equal(t, sorted(tt.wantRemove), sorted(remove))
		})
	}
}

func TestPlanModelVersionsIgnoresSymlinks(t *testing.T) {
	modelsDir := t.TempDir()
	buildModelDir(t, modelsDir, "some-model", []string{"v1.0.0", "v1.1.0"}, nil)

	outside := t.TempDir()
	require.NoError(t, os.MkdirAll(filepath.Join(outside, "v9.9.9"), 0o755))
	link := filepath.Join(modelsDir, "some-model", "v9.9.9")
	require.NoError(t, os.Symlink(filepath.Join(outside, "v9.9.9"), link))

	retain, remove, err := planModelVersions(filepath.Join(modelsDir, "some-model"), 1)
	require.NoError(t, err)
	assert.Equal(t, []string{"v1.1.0"}, retain)
	assert.Equal(t, []string{"v1.0.0"}, remove)
	// The symlink itself must still exist - it was never followed or removed.
	_, err = os.Lstat(link)
	assert.NoError(t, err)
}

func TestBuildExcludeSet(t *testing.T) {
	tests := []struct {
		name  string
		extra string
		want  []string
	}{
		{name: "defaults only", extra: "", want: []string{"kubernetes", "meshery-core"}},
		{name: "additions appended, not replacing defaults", extra: "aws-ec2-controller,cilium", want: []string{"kubernetes", "meshery-core", "aws-ec2-controller", "cilium"}},
		{name: "whitespace and empty entries are ignored", extra: " aws-ec2-controller , , cilium ", want: []string{"kubernetes", "meshery-core", "aws-ec2-controller", "cilium"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			set := buildExcludeSet(tt.extra)
			for _, name := range tt.want {
				assert.True(t, set[name], "expected %s to be excluded", name)
			}
			assert.Len(t, set, len(tt.want))
		})
	}
}

func TestBuildPurgePlan(t *testing.T) {
	modelsDir := t.TempDir()
	buildModelDir(t, modelsDir, "kubernetes", []string{"v1.35.0", "v1.35.0-rc.1", "v1.36.0"}, []string{"model_template.json"})
	buildModelDir(t, modelsDir, "meshery-core", []string{"0.7.1", "0.7.2"}, nil)
	buildModelDir(t, modelsDir, "aws-ec2-controller", []string{"v1.18.2"}, []string{".DS_Store"})
	buildModelDir(t, modelsDir, "cilium", []string{"v1.0.0", "v1.1.0", "v1.2.0"}, nil)
	buildModelDir(t, modelsDir, "no-versions-model", nil, []string{"README.md"})
	// A stray file directly under models/ must not be treated as a model.
	require.NoError(t, os.WriteFile(filepath.Join(modelsDir, "NOTES.txt"), []byte("x"), 0o644))

	t.Run("default exclusions honoured, retain=1", func(t *testing.T) {
		plan, err := buildPurgePlan(modelsDir, 1, buildExcludeSet(""))
		require.NoError(t, err)

		assert.ElementsMatch(t, []string{"kubernetes", "meshery-core"}, plan.excludedModels)
		assert.ElementsMatch(t, []string{"no-versions-model"}, plan.noVersionModels)
		assert.NotContains(t, plan.models, "kubernetes")
		assert.NotContains(t, plan.models, "meshery-core")

		require.Contains(t, plan.models, "cilium")
		assert.Equal(t, []string{"v1.2.0"}, plan.models["cilium"].retain)
		assert.ElementsMatch(t, []string{"v1.0.0", "v1.1.0"}, plan.models["cilium"].remove)

		require.Contains(t, plan.models, "aws-ec2-controller")
		assert.Equal(t, []string{"v1.18.2"}, plan.models["aws-ec2-controller"].retain)
		assert.Empty(t, plan.models["aws-ec2-controller"].remove)

		assert.Equal(t, 2, plan.totalToRemove())
	})

	t.Run("retain=2 keeps two most recent", func(t *testing.T) {
		plan, err := buildPurgePlan(modelsDir, 2, buildExcludeSet(""))
		require.NoError(t, err)
		assert.ElementsMatch(t, []string{"v1.1.0", "v1.2.0"}, plan.models["cilium"].retain)
		assert.Equal(t, []string{"v1.0.0"}, plan.models["cilium"].remove)
	})

	t.Run("--exclude adds to, not replaces, default exclusions", func(t *testing.T) {
		plan, err := buildPurgePlan(modelsDir, 1, buildExcludeSet("cilium"))
		require.NoError(t, err)
		assert.ElementsMatch(t, []string{"kubernetes", "meshery-core", "cilium"}, plan.excludedModels)
		assert.NotContains(t, plan.models, "cilium")
	})
}

// resetPurgeFlags restores package-level flag state that RunE reads, so
// tests do not leak state into one another.
func resetPurgeFlags(t *testing.T) {
	t.Helper()
	utils.SetupMeshkitLoggerTesting(t, false)
	origRetain, origExclude, origDryRun, origSilent := purgeRetain, purgeExclude, purgeDryRun, utils.SilentFlag
	purgeRetain, purgeExclude, purgeDryRun = 1, "", false
	t.Cleanup(func() {
		purgeRetain, purgeExclude, purgeDryRun, utils.SilentFlag = origRetain, origExclude, origDryRun, origSilent
	})
}

func TestPurgeCmdRunE_DryRunRemovesNothing(t *testing.T) {
	resetPurgeFlags(t)
	root := t.TempDir()
	root, err := filepath.EvalSymlinks(root)
	require.NoError(t, err)
	modelsDir := filepath.Join(root, "models")
	buildModelDir(t, modelsDir, "cilium", []string{"v1.0.0", "v1.1.0", "v1.2.0"}, nil)
	chdir(t, root)

	purgeRetain = 1
	purgeDryRun = true
	utils.SilentFlag = false // must not matter: dry-run never prompts

	err = purgeCmd.RunE(purgeCmd, nil)
	require.NoError(t, err)

	for _, v := range []string{"v1.0.0", "v1.1.0", "v1.2.0"} {
		_, err := os.Stat(filepath.Join(modelsDir, "cilium", v))
		assert.NoError(t, err, "dry-run must not remove %s", v)
	}
}

func TestPurgeCmdRunE_RemovesOldVersions(t *testing.T) {
	resetPurgeFlags(t)
	root := t.TempDir()
	root, err := filepath.EvalSymlinks(root)
	require.NoError(t, err)
	modelsDir := filepath.Join(root, "models")
	buildModelDir(t, modelsDir, "cilium", []string{"v1.0.0", "v1.1.0", "v1.2.0"}, nil)
	buildModelDir(t, modelsDir, "kubernetes", []string{"v1.35.0", "v1.36.0"}, nil)
	chdir(t, root)

	purgeRetain = 1
	purgeDryRun = false
	utils.SilentFlag = true

	err = purgeCmd.RunE(purgeCmd, nil)
	require.NoError(t, err)

	_, err = os.Stat(filepath.Join(modelsDir, "cilium", "v1.2.0"))
	assert.NoError(t, err, "the retained version must survive")
	for _, v := range []string{"v1.0.0", "v1.1.0"} {
		_, err := os.Stat(filepath.Join(modelsDir, "cilium", v))
		assert.True(t, os.IsNotExist(err), "%s should have been removed", v)
	}

	// kubernetes is always excluded and must be untouched.
	for _, v := range []string{"v1.35.0", "v1.36.0"} {
		_, err := os.Stat(filepath.Join(modelsDir, "kubernetes", v))
		assert.NoError(t, err, "kubernetes is always excluded, %s must survive", v)
	}
}

func TestPurgeCmdRunE_InvalidRetain(t *testing.T) {
	resetPurgeFlags(t)
	root := t.TempDir()
	chdir(t, root)

	purgeRetain = 0
	err := purgeCmd.RunE(purgeCmd, nil)
	assert.Error(t, err)
}

func TestPurgeCmdRunE_MissingModelsDirDoesNotCrash(t *testing.T) {
	resetPurgeFlags(t)
	root := t.TempDir()
	chdir(t, root)

	purgeRetain = 1
	err := purgeCmd.RunE(purgeCmd, nil)
	assert.NoError(t, err, "a missing ./models directory should warn, not fail")
}

func TestPurgeCmdFlags(t *testing.T) {
	tests := []struct {
		flagName     string
		defaultValue string
		expectedType string
	}{
		{flagName: "retain", defaultValue: "1", expectedType: "int"},
		{flagName: "exclude", defaultValue: "", expectedType: "string"},
		{flagName: "dry-run", defaultValue: "false", expectedType: "bool"},
		{flagName: "yes", defaultValue: "false", expectedType: "bool"},
	}

	for _, tt := range tests {
		t.Run(tt.flagName, func(t *testing.T) {
			flag := purgeCmd.Flags().Lookup(tt.flagName)
			require.NotNil(t, flag, "flag %s should exist", tt.flagName)
			assert.Equal(t, tt.defaultValue, flag.DefValue)
			assert.Equal(t, tt.expectedType, flag.Value.Type())
		})
	}
}

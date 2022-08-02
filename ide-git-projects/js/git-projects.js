/*
 * Copyright (c) 2010-2022 SAP SE or an SAP affiliate company and Eclipse Dirigible contributors
 *
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * SPDX-FileCopyrightText: 2010-2022 SAP SE or an SAP affiliate company and Eclipse Dirigible contributors
 * SPDX-License-Identifier: EPL-2.0
 */
let gitProjectsView = angular.module('gitProjects', ['ideUI', 'ideView', 'ideWorkspace', 'idePublisher', 'ideTransport']);

gitProjectsView.controller('ProjectsViewController', [
    '$scope',
    'messageHub',
    'workspaceApi',
    'publisherApi',
    'transportApi',
    function (
        $scope,
        messageHub,
        workspaceApi,
        publisherApi,
        transportApi,
    ) {
        $scope.searchVisible = false;
        $scope.searchField = { text: '' };
        $scope.workspaceNames = [];
        $scope.imageFileExts = ['ico', 'bmp', 'png', 'jpg', 'jpeg', 'gif', 'svg'];
        $scope.modelFileExts = ['extension', 'extensionpoint', 'edm', 'model', 'dsm', 'schema', 'bpmn', 'job', 'listener', 'websocket', 'roles', 'constraints', 'table', 'view'];

        $scope.selectedWorkspace = JSON.parse(localStorage.getItem('DIRIGIBLE.workspace') || '{}');
        if (!$scope.selectedWorkspace.name) {
            $scope.selectedWorkspace = { name: 'workspace' }; // Default
            saveSelectedWorkspace();
        }

        $scope.projects = [];

        $scope.jstreeWidget = angular.element('#dgProjects');
        $scope.spinnerObj = {
            text: "Loading...",
            type: "spinner",
            li_attr: { spinner: true },
        };
        $scope.jstreeConfig = {
            core: {
                check_callback: true,
                themes: {
                    name: "fiori",
                    variant: "compact",
                },
                data: function (node, cb) {
                    cb($scope.projects);
                },
            },
            search: {
                case_sensitive: false,
            },
            plugins: ["wholerow", "search", "state", "types", "indicator"],
            dnd: {
                large_drop_target: true,
                large_drag_target: true,
                is_draggable: function (nodes) {
                    for (let i = 0; i < nodes.length; i++) {
                        if (nodes[i].type === 'project') return false;
                    }
                    return true;
                },
            },
            state: { key: 'ide-projects' },
            types: {
                '#': {
                    valid_children: ["project"]
                },
                "default": {
                    icon: "sap-icon--question-mark",
                    valid_children: [],
                },
                file: {
                    icon: "jstree-file",
                    valid_children: [],
                },
                folder: {
                    icon: "jstree-folder",
                    valid_children: ['folder', 'file', 'spinner'],
                },
                project: {
                    icon: "jstree-project",
                    valid_children: ['folder', 'file', 'spinner'],
                },
                spinner: {
                    icon: "jstree-spinner",
                    valid_children: [],
                },
            },
        };

        $scope.jstreeWidget.on('select_node.jstree', function (event, data) {
            if (data.event && data.event.type === 'click' && data.node.type === 'file') {
                messageHub.announceFileSelected({
                    name: data.node.text,
                    path: data.node.data.path,
                    contentType: data.node.data.contentType,
                    workspace: data.node.data.workspace,
                });
            }
        });

        $scope.jstreeWidget.on('dblclick.jstree', function (event) {
            let node = $scope.jstreeWidget.jstree(true).get_node(event.target);
            if (node.type === 'file') {
                showDiff(node);
            }
        });

        function getProjectNode(parents) {
            for (let i = 0; i < parents.length; i++) {
                if (parents[i] !== '#') {
                    let parent = $scope.jstreeWidget.jstree(true).get_node(parents[i]);
                    if (parent.type === 'project') {
                        return parent;
                    }
                }
            }
        }

        $scope.contextMenuContent = function (element) {
            if ($scope.jstreeWidget[0].contains(element)) {
                let id;
                if (element.tagName !== "LI") {
                    let closest = element.closest("li");
                    if (closest) id = closest.id;
                    else return {
                        callbackTopic: "git-projects.tree.contextmenu",
                        items: []
                    }
                } else {
                    id = element.id;
                }
                if (id) {
                    let node = $scope.jstreeWidget.jstree(true).get_node(id);
                    if (node.type === 'project') {
                    } else if (node.type === "folder") {
                    } else if (node.type === "file") {
                    }
                }
                return;
            } else return;
        };

        $scope.toggleSearch = function () {
            $scope.searchField.text = '';
            $scope.jstreeWidget.jstree(true).clear_search();
            $scope.searchVisible = !$scope.searchVisible;
        };

        $scope.isSelectedWorkspace = function (name) {
            if ($scope.selectedWorkspace.name === name) return true;
            return false;
        };

        $scope.reloadWorkspaceList = function () {
            workspaceApi.listWorkspaceNames().then(function (response) {
                if (response.status === 200)
                    $scope.workspaceNames = response.data;
                else messageHub.setStatusError('Unable to load workspace list');
            });
        };

        $scope.reloadWorkspace = function (setConfig = false) {
            $scope.projects.length = 0;
            workspaceApi.load($scope.selectedWorkspace.name).then(function (response) {
                if (response.status === 200) {
                    for (let i = 0; i < response.data.projects.length; i++) {
                        let project = {
                            text: response.data.projects[i].name,
                            type: response.data.projects[i].type,
                            data: {
                                git: response.data.projects[i].git,
                                gitName: response.data.projects[i].gitName,
                                path: response.data.projects[i].path.substring(response.data.path.length, response.data.projects[i].path.length), // Back-end should not include workspase name in path
                                workspace: response.data.name,
                            },
                            li_attr: { git: response.data.projects[i].git },
                        };
                        if (response.data.projects[i].folders && response.data.projects[i].files) {
                            project['children'] = processChildren(response.data.projects[i].folders.concat(response.data.projects[i].files));
                        } else if (response.data.projects[i].folders) {
                            project['children'] = processChildren(response.data.projects[i].folders);
                        } else if (response.data.projects[i].files) {
                            project['children'] = processChildren(response.data.projects[i].files);
                        }
                        $scope.projects.push(project);
                    }
                    if (setConfig) $scope.jstreeWidget.jstree($scope.jstreeConfig);
                    else $scope.jstreeWidget.jstree(true).refresh();
                } else {
                    messageHub.setStatusError('Unable to load workspace data');
                }
            });
        };

        $scope.publishAll = function () {
            messageHub.showStatusBusy("Publishing projects...");
            publisherApi.publish(`/${$scope.selectedWorkspace.name}/*`).then(function (response) {
                messageHub.hideStatusBusy();
                if (response.status !== 201)
                    messageHub.setStatusError(`Unable to publish projects in '${$scope.selectedWorkspace.name}'`);
                else messageHub.setStatusMessage(`Published all projects in '${$scope.selectedWorkspace.name}'`);
            });
        };

        $scope.unpublishAll = function () {
            messageHub.showStatusBusy("Unpublishing projects...");
            publisherApi.unpublish(`/${$scope.selectedWorkspace.name}/*`).then(function (response) {
                messageHub.hideStatusBusy();
                if (response.status !== 201)
                    messageHub.setStatusError(`Unable to unpublish projects in '${$scope.selectedWorkspace.name}'`);
                else messageHub.setStatusMessage(`Unpublished all projects in '${$scope.selectedWorkspace.name}'`);
            });
        };

        $scope.publish = function (path, workspace, callback) {
            messageHub.showStatusBusy(`Publishing '${path}'...`);
            publisherApi.publish(path, workspace).then(function (response) {
                messageHub.hideStatusBusy();
                if (response.status !== 201) {
                    messageHub.setStatusError(`Unable to publish '${path}'`);
                } else {
                    messageHub.setStatusMessage(`Published '${path}'`);
                    if (callback) callback();
                }
            });
        };

        $scope.unpublish = function (path, workspace, callback) {
            messageHub.showStatusBusy(`Unpublishing '${path}'...`);
            publisherApi.unpublish(path, workspace).then(function (response) {
                messageHub.hideStatusBusy();
                if (response.status !== 201) {
                    messageHub.setStatusError(`Unable to unpublish '${path}'`);
                } else {
                    messageHub.setStatusMessage(`Unpublished '${path}'`);
                    if (callback) callback();
                }
            });
        };

        $scope.switchWorkspace = function (workspace) {
            if ($scope.selectedWorkspace.name !== workspace) {
                $scope.selectedWorkspace.name = workspace;
                saveSelectedWorkspace();
                $scope.reloadWorkspace();
            }
        };

        let to = 0;
        $scope.search = function () {
            if (to) { clearTimeout(to); }
            to = setTimeout(function () {
                $scope.jstreeWidget.jstree(true).search($scope.searchField.text);
            }, 250);
        };

        function showSpinner(parent) {
            return $scope.jstreeWidget.jstree(true).create_node(parent, $scope.spinnerObj, 0);
        }

        function hideSpinner(spinnerId) {
            $scope.jstreeWidget.jstree(true).delete_node($scope.jstreeWidget.jstree(true).get_node(spinnerId));
        }

        function processChildren(children) {
            let treeChildren = [];
            for (let i = 0; i < children.length; i++) {
                let child = {
                    text: children[i].name,
                    type: children[i].type,
                    state: {
                        status: children[i].status
                    },
                    data: {
                        path: children[i].path.substring($scope.selectedWorkspace.name.length + 1, children[i].path.length), // Back-end should not include workspase name in path
                        workspace: $scope.selectedWorkspace.name,
                    }
                };
                if (children[i].type === 'file') {
                    child.data.contentType = children[i].contentType;
                    let icon = getFileIcon(children[i].name);
                    if (icon) child.icon = icon;
                }
                if (children[i].folders && children[i].files) {
                    child['children'] = processChildren(children[i].folders.concat(children[i].files));
                } else if (children[i].folders) {
                    child['children'] = processChildren(children[i].folders);
                } else if (children[i].files) {
                    child['children'] = processChildren(children[i].files);
                }
                treeChildren.push(child);
            }
            return treeChildren;
        }

        function getFileExtension(fileName) {
            return fileName.substring(fileName.lastIndexOf('.') + 1, fileName.length).toLowerCase();
        }

        function getFileIcon(fileName) {
            let ext = getFileExtension(fileName);
            let icon;
            if (ext === 'js' || ext === 'mjs' || ext === 'xsjs' || ext === 'ts' || ext === 'json') {
                icon = "sap-icon--syntax";
            } else if (ext === 'css' || ext === 'less' || ext === 'scss') {
                icon = "sap-icon--number-sign";
            } else if (ext === 'txt') {
                icon = "sap-icon--text";
            } else if (ext === 'pdf') {
                icon = "sap-icon--pdf-attachment";
            } else if ($scope.imageFileExts.indexOf(ext) !== -1) {
                icon = "sap-icon--picture";
            } else if ($scope.modelFileExts.indexOf(ext) !== -1) {
                icon = "sap-icon--document-text";
            } else {
                icon = 'jstree-file';
            }
            return icon;
        }

        function showDiff(node) {
            let parent = node;
            let extraArgs;
            for (let i = 0; i < node.parents.length - 1; i++) {
                parent = $scope.jstreeWidget.jstree(true).get_node(parent.parent);
            }
            if (parent.data.git) {
                extraArgs = { gitName: parent.data.gitName };
            }
        }

        function saveSelectedWorkspace() {
            localStorage.setItem('DIRIGIBLE.workspace', JSON.stringify($scope.selectedWorkspace));
        }

        messageHub.onWorkspaceChanged(function (workspace) {
            if (workspace.data.name === $scope.selectedWorkspace.name)
                $scope.reloadWorkspace();
            if (workspace.data.publish) {
                if (workspace.data.publish.workspace) {
                    $scope.publish(`/${workspace.data.name}/*`);
                } else if (workspace.data.publish.path) {
                    $scope.publish(workspace.data.publish.path, workspace.data.name);
                }
            }
        });

        messageHub.onDidReceiveMessage(
            'git-projects.tree.contextmenu',
            function (msg) {
                if (msg.data.itemId === 'showDiff') {
                    showDiff(msg.data.data);
                }
            },
            true
        );

        // Initialization
        $scope.reloadWorkspace(true);
        $scope.reloadWorkspaceList();
    }]);

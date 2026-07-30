"""Regression tests for the cross-platform desktop bootstrapper."""

from pathlib import Path
from unittest import TestCase, mock

import main


class BootstrapTests(TestCase):
    def test_renderer_starts_without_demo_workspace_records(self) -> None:
        renderer = (Path(__file__).parent / "app.js").read_text(encoding="utf-8")

        self.assertIn("projects: [], tasks: [], databank: [], documentation: [], people: [], activity: []", renderer)
        self.assertNotIn("Project Orbit", renderer)
        self.assertNotIn("Atlas Partnership", renderer)
        self.assertNotIn("Preliminary delivery conditions", renderer)

    def test_renderer_migrates_legacy_demo_ids_and_exposes_crud_controls(self) -> None:
        renderer = (Path(__file__).parent / "app.js").read_text(encoding="utf-8")

        for demo_id in ("project-orbit", "project-atlas", "task-delivery", "task-partners"):
            self.assertIn(demo_id, renderer)
        for control in (
            "data-edit-project",
            "data-delete-project",
            "data-edit-task",
            "data-delete-task",
        ):
            self.assertIn(control, renderer)
        self.assertIn("function deleteProject", renderer)
        self.assertIn("function deleteTask", renderer)

    def test_project_view_exposes_operational_dashboard_and_task_reordering(self) -> None:
        renderer = (Path(__file__).parent / "app.js").read_text(encoding="utf-8")

        for dashboard_feature in (
            "function projectView",
            "COMPLETED",
            "IN PROGRESS",
            "RECENT ACTIVITY",
            "CURRENT OBJECTIVE",
            "function bindTaskReorder",
            'draggable="true"',
            "reorder project tasks",
        ):
            self.assertIn(dashboard_feature, renderer)

    def test_task_view_exposes_brief_delivery_and_completion_path(self) -> None:
        renderer = (Path(__file__).parent / "app.js").read_text(encoding="utf-8")

        for task_feature in (
            "function taskDetailView",
            "COMPLETION PATH",
            "WHAT NEEDS TO HAPPEN",
            "DELIVERY WORKSPACE",
            "FINAL CONFIRMED RESULT",
            "function advanceSelectedTask",
            "advance task status",
        ):
            self.assertIn(task_feature, renderer)

    def test_github_auto_match_imports_closed_pull_requests_as_completed_tasks(self) -> None:
        root = Path(__file__).parent
        renderer = (root / "app.js").read_text(encoding="utf-8")
        electron = (root / "main.js").read_text(encoding="utf-8")
        preload = (root / "preload.js").read_text(encoding="utf-8")

        self.assertIn("function findRepositoryByName", electron)
        self.assertIn("state=closed", electron)
        self.assertIn("github:match-completed", electron)
        self.assertIn("matchCompletedPullRequests", preload)
        self.assertIn("async function autoMatchProject", renderer)
        self.assertIn("status:'Completed'", renderer)
        self.assertIn("githubRef", renderer)
        self.assertIn("sync completed GitHub pull requests", renderer)

    def test_tasks_are_mirrored_exclusively_to_bridge_issues(self) -> None:
        root = Path(__file__).parent
        renderer = (root / "app.js").read_text(encoding="utf-8")
        electron = (root / "main.js").read_text(encoding="utf-8")
        preload = (root / "preload.js").read_text(encoding="utf-8")

        self.assertIn("/issues?state=all", electron)
        self.assertIn("/issues/${number}", electron)
        self.assertIn("!issue.pull_request", electron)
        self.assertIn("createBridgeIssue", preload)
        self.assertIn("updateBridgeIssue", preload)
        self.assertIn("async function syncBridgeIssues", renderer)
        self.assertIn("GitHub Bridge issue", renderer)
        self.assertIn("state:completed?'closed':'open'", renderer)

    def test_remote_issue_closure_is_polled_and_persisted_locally(self) -> None:
        renderer = (Path(__file__).parent / "app.js").read_text(encoding="utf-8")

        self.assertIn("function startBridgeIssuePolling", renderer)
        self.assertIn("setInterval(async()=>", renderer)
        self.assertIn("issue.state==='closed'", renderer)
        self.assertIn("task.status='Completed'", renderer)
        self.assertIn("queueSave('sync Bridge issues')", renderer)

    def test_tasks_are_visually_separated_and_databank_records_follow_lifecycle(self) -> None:
        root = Path(__file__).parent
        renderer = (root / "app.js").read_text(encoding="utf-8")
        styles = (root / "styles.css").read_text(encoding="utf-8")

        for feature in (
            "DO THIS NOW",
            "ACTIVE EXECUTION PLAN",
            "COMPLETED WORK",
            "function ensureDatabankRecord",
            "function reconcileCompletedTasks",
            "record.taskId!==id",
        ):
            self.assertIn(feature, renderer)
        self.assertIn(".status.completed,.status.approved", styles)
        self.assertIn("color:var(--danger)", styles)
        self.assertIn("@keyframes signal", styles)

    def test_tasks_tab_has_separate_active_and_completed_operations(self) -> None:
        root = Path(__file__).parent
        renderer = (root / "app.js").read_text(encoding="utf-8")
        styles = (root / "styles.css").read_text(encoding="utf-8")

        for feature in (
            "Execution queue.",
            "ACTIVE QUEUE",
            "NEEDS ACTION",
            "COMPLETED TASKS",
            "TOP OF THE EXECUTION QUEUE",
            "active.map",
            "completed.map",
        ):
            self.assertIn(feature, renderer)
        self.assertIn(".task-board", styles)
        self.assertIn(".operation-task.is-completed", styles)

    def test_info_tab_uploads_and_opens_bridge_backed_pdf_documentation(self) -> None:
        root = Path(__file__).parent
        renderer = (root / "app.js").read_text(encoding="utf-8")
        electron = (root / "main.js").read_text(encoding="utf-8")
        preload = (root / "preload.js").read_text(encoding="utf-8")
        html = (root / "index.html").read_text(encoding="utf-8")

        self.assertIn('data-view="info"', html)
        self.assertIn("function infoView", renderer)
        self.assertIn("function documentationDialog", renderer)
        self.assertIn("documentation: [],", renderer)
        self.assertIn("uploadDocumentation", preload)
        self.assertIn("readDocumentation", preload)
        self.assertIn("deleteDocumentation", preload)
        self.assertIn("documentation:upload", electron)
        self.assertIn("documentation:read", electron)
        self.assertIn("documentation:delete", electron)
        self.assertIn("application/vnd.github.raw+json", electron)
        self.assertIn("'%PDF-'", electron)
        self.assertIn("20 * 1024 * 1024", electron)
        self.assertIn('id="documentViewer"', html)
        self.assertIn("function closeDocumentViewer", renderer)
        self.assertIn("URL.createObjectURL", renderer)

    def test_find_npm_prefers_windows_command_shim(self) -> None:
        locations = {
            "npm.cmd": r"C:\Program Files\nodejs\npm.cmd",
            "npm.exe": None,
            "npm": None,
        }

        with mock.patch.object(main.sys, "platform", "win32"), mock.patch.object(
            main.shutil, "which", side_effect=locations.get
        ) as which:
            self.assertEqual(main.find_npm(), locations["npm.cmd"])

        which.assert_called_once_with("npm.cmd")

    def test_main_installs_with_resolved_npm_path(self) -> None:
        from tempfile import TemporaryDirectory

        with TemporaryDirectory() as directory:
            tmp_path = Path(directory)
            package = tmp_path / "package.json"
            package.write_text(
                '{"devDependencies":{"electron":"1.0.0"}}', encoding="utf-8"
            )
            npm = r"C:\Program Files\nodejs\npm.cmd"
            calls: list[list[str]] = []

            def fake_run(command: list[str]) -> None:
                calls.append(command)
                if command[1:2] == ["install"]:
                    electron = tmp_path / "node_modules" / ".bin" / "electron.cmd"
                    electron.parent.mkdir(parents=True)
                    electron.touch()

            with mock.patch.object(main, "ROOT", tmp_path), mock.patch.object(
                main, "PACKAGE_JSON", package
            ), mock.patch.object(main.sys, "platform", "win32"), mock.patch.object(
                main, "find_npm", return_value=npm
            ), mock.patch.object(main, "run", side_effect=fake_run):
                main.main()

            self.assertEqual(calls[0], [npm, "install", "--no-audit", "--no-fund"])
            self.assertEqual(
                calls[1],
                [
                    str(tmp_path / "node_modules" / ".bin" / "electron.cmd"),
                    str(tmp_path / "main.js"),
                ],
            )

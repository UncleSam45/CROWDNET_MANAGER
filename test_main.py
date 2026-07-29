"""Regression tests for the cross-platform desktop bootstrapper."""

from pathlib import Path
from unittest import TestCase, mock

import main


class BootstrapTests(TestCase):
    def test_renderer_starts_without_demo_workspace_records(self) -> None:
        renderer = (Path(__file__).parent / "app.js").read_text(encoding="utf-8")

        self.assertIn("projects: [], tasks: [], databank: [], people: [], activity: []", renderer)
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

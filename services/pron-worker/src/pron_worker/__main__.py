"""Start the worker on the worktree's configuration: `python -m pron_worker`."""

import os
import threading

from pron_worker.worker import launch, settings_from

launch(settings_from(os.environ))
threading.Event().wait()

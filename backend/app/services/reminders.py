"""Background task that checks for due reminders and creates notifications."""
import asyncio
from datetime import datetime
from sqlalchemy.orm import Session
from .. import models, database


async def check_reminders():
    """Periodically check for tasks with approaching due times and create notifications."""
    while True:
        try:
            db = database.SessionLocal()
            try:
                now = datetime.now()
                # Find tasks where reminder_at <= now and reminder not yet sent
                tasks = db.query(models.Task).filter(
                    models.Task.reminder_at != None,
                    models.Task.reminder_sent == False,
                    models.Task.reminder_at <= now,
                    models.Task.status != "done",
                ).all()

                for task in tasks:
                    # Create notification for the user
                    notification = models.Notification(
                        user_id=task.user_id,
                        title="Task Reminder",
                        message=f"Reminder: \"{task.title}\" is due"
                                + (f" at {task.due_date.strftime('%I:%M %p')}" if task.due_date else ""),
                        type="reminder",
                        priority="high",
                        related_type="task",
                        related_id=task.id,
                    )
                    db.add(notification)
                    task.reminder_sent = True

                if tasks:
                    db.commit()
                    print(f"[REMINDER] Sent {len(tasks)} reminder(s)")
            finally:
                db.close()
        except Exception as e:
            print(f"[REMINDER] Error: {e}")
        
        await asyncio.sleep(60)  # Check every 60 seconds

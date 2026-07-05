from openai import OpenAI
from ..config import AI_API_KEY, OPENROUTER_API_KEY
from typing import Generator
import traceback
import re as _re
from datetime import datetime, timedelta
from dateutil import parser as dateparser

# ========== TIME PARSING ==========
def parse_task_datetime(user_message: str) -> tuple:
    """Parse date and time from user message. Returns (due_date, reminder_at) or (None, None)."""
    msg = user_message.lower().strip()
    now = datetime.now()
    
    # Relative day patterns
    day_offset = 0
    if 'tomorrow' in msg or 'kal' in msg:
        day_offset = 1
    elif 'day after tomorrow' in msg:
        day_offset = 2
    elif 'next week' in msg:
        day_offset = 7
    elif 'next monday' in msg:
        days_ahead = (7 - now.weekday()) % 7 or 7
        day_offset = days_ahead
    elif 'next tuesday' in msg:
        days_ahead = (1 - now.weekday()) % 7 or 7
        day_offset = days_ahead
    elif 'next wednesday' in msg:
        days_ahead = (2 - now.weekday()) % 7 or 7
        day_offset = days_ahead
    elif 'next thursday' in msg:
        days_ahead = (3 - now.weekday()) % 7 or 7
        day_offset = days_ahead
    elif 'next friday' in msg:
        days_ahead = (4 - now.weekday()) % 7 or 7
        day_offset = days_ahead
    elif 'next saturday' in msg:
        days_ahead = (5 - now.weekday()) % 7 or 7
        day_offset = days_ahead
    elif 'next sunday' in msg:
        days_ahead = (6 - now.weekday()) % 7 or 7
        day_offset = days_ahead
    
    # Time patterns
    time_match = None
    time_patterns = [
        r'at\s+(\d{1,2}):(\d{2})\s*(am|pm)',
        r'at\s+(\d{1,2})\s*(am|pm)',
        r'(\d{1,2}):(\d{2})\s*(am|pm)',
        r'(\d{1,2})\s*(am|pm)',
        r'at\s+(\d{1,2}):(\d{2})',
        r'(\d{1,2}):(\d{2})',
    ]
    
    hour = minute = None
    for pat in time_patterns:
        m = _re.search(pat, msg)
        if m:
            groups = m.groups()
            if len(groups) == 3:
                hour = int(groups[0])
                minute = int(groups[1])
                if groups[2] == 'pm' and hour < 12:
                    hour += 12
                elif groups[2] == 'am' and hour == 12:
                    hour = 0
            elif len(groups) == 2:
                if groups[1] in ('am', 'pm'):
                    hour = int(groups[0])
                    minute = 0
                    if groups[1] == 'pm' and hour < 12:
                        hour += 12
                    elif groups[1] == 'am' and hour == 12:
                        hour = 0
                else:
                    hour = int(groups[0])
                    minute = int(groups[1])
            break
    
    if day_offset > 0 or hour is not None:
        target_date = now + timedelta(days=day_offset)
        if hour is not None:
            due_date = target_date.replace(hour=hour, minute=minute or 0, second=0, microsecond=0)
        else:
            due_date = target_date.replace(hour=9, minute=0, second=0, microsecond=0)  # default 9 AM
        
        # Reminder: 15 minutes before
        reminder_at = due_date - timedelta(minutes=15)
        return due_date, reminder_at
    
    return None, None


# ========== PROVIDER CONFIGS ==========
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"
GEMINI_MODEL = "gemini-2.0-flash"

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
OPENROUTER_MODELS = [
    "nvidia/nemotron-nano-9b-v2:free",
    "openai/gpt-oss-20b:free",
]

# Ollama local config
OLLAMA_BASE_URL = "http://ollama:11434/v1"
OLLAMA_MODEL = "llama3.2:1b"

# Model selector options
MODEL_OPTIONS = {
    "fast": {"name": "Gemini Flash (Fast)", "provider": "gemini", "model": GEMINI_MODEL},
    "smart": {"name": "GPT OSS 20B (Smart)", "provider": "openrouter", "model": "openai/gpt-oss-20b:free"},
    "free": {"name": "Nemotron Nano (Free)", "provider": "openrouter", "model": "nvidia/nemotron-nano-9b-v2:free"},
    "ollama": {"name": "Ollama Local (Unlimited)", "provider": "ollama", "model": OLLAMA_MODEL},
    "auto": {"name": "Auto (Best Available)", "provider": "auto", "model": None},
}

# ========== SILENT FALLBACK HELPER ==========
def _try_provider(provider_name: str, model: str, messages: list, timeout: float = 30.0, stream: bool = False):
    """Try a single AI provider. Returns response or None on failure."""
    try:
        if provider_name == "gemini":
            if not AI_API_KEY or AI_API_KEY == "placeholder":
                return None
            client = OpenAI(api_key=AI_API_KEY, base_url=GEMINI_BASE_URL, timeout=timeout)
        elif provider_name == "openrouter":
            if not OPENROUTER_API_KEY or OPENROUTER_API_KEY == "placeholder":
                return None
            client = OpenAI(api_key=OPENROUTER_API_KEY, base_url=OPENROUTER_BASE_URL, timeout=timeout)
        elif provider_name == "ollama":
            client = OpenAI(api_key="ollama", base_url=OLLAMA_BASE_URL, timeout=timeout)
        else:
            return None

        if stream:
            return client.chat.completions.create(model=model, messages=messages, stream=True)
        else:
            response = client.chat.completions.create(model=model, messages=messages)
            return response.choices[0].message.content
    except Exception as e:
        print(f"[AI FALLBACK] {provider_name}/{model} failed: {type(e).__name__}: {e}")
        return None


def _get_all_providers(model_choice: str = "auto"):
    """Get ordered list of providers to try based on user selection."""
    selected = MODEL_OPTIONS.get(model_choice, MODEL_OPTIONS["auto"])
    
    if selected["provider"] == "auto":
        # Auto: try all in order
        providers = []
        # Gemini first
        if AI_API_KEY and AI_API_KEY != "placeholder":
            providers.append(("gemini", GEMINI_MODEL))
        # OpenRouter models
        if OPENROUTER_API_KEY and OPENROUTER_API_KEY != "placeholder":
            for model in OPENROUTER_MODELS:
                providers.append(("openrouter", model))
        # Ollama always last as fallback
        providers.append(("ollama", OLLAMA_MODEL))
        return providers
    else:
        # Specific provider chosen, but still fallback to others if it fails
        providers = [(selected["provider"], selected["model"])]
        # Add fallbacks
        if selected["provider"] != "gemini" and AI_API_KEY and AI_API_KEY != "placeholder":
            providers.append(("gemini", GEMINI_MODEL))
        if selected["provider"] != "openrouter" and OPENROUTER_API_KEY and OPENROUTER_API_KEY != "placeholder":
            for model in OPENROUTER_MODELS:
                providers.append(("openrouter", model))
        if selected["provider"] != "ollama":
            providers.append(("ollama", OLLAMA_MODEL))
        return providers


# ========== TASK DETECTION ==========
TASK_SYSTEM_PROMPT = """You are a task detection system. Analyze the user message and determine if it contains a task-related action.

IMPORTANT PRIORITY RULES:
1. If message contains BOTH "in progress" AND "complete/done", prioritize COMPLETE action
2. If message contains "complete" or "done" (with task context), always use complete action
3. Only use "progress" if there is NO "complete/done" keyword

Return ONLY a JSON object (no markdown, no code blocks) with this exact format:
{"action": "none"}

If the user wants to CREATE a task (e.g. "arrange meeting at 3pm tomorrow", "schedule call with team", "remind me to buy groceries"):
{"action": "create", "title": "<task title>", "due_date": "<ISO datetime or null>", "description": "<optional description>"}

If the user wants to COMPLETE/finish a task (e.g. "meeting complete", "done with the call", "task done", "completed", "complete it", "ok complete"):
{"action": "complete", "title_keywords": "<keywords to match existing task>"}

If the user wants to mark a task as IN PROGRESS or STARTED (ONLY if no "complete/done" in message):
{"action": "progress", "title_keywords": "<keywords to match existing task>"}

If the user wants to set a task as PENDING (e.g. "keep it pending", "mark as pending"):
{"action": "pending", "title_keywords": "<keywords to match existing task>"}

If the message is just a normal conversation/greeting, return:
{"action": "none"}

Examples:
- "Arrange a meeting at 3pm tomorrow" → {"action": "create", "title": "Arrange meeting", "due_date": "2026-07-05T15:00:00", "description": "Meeting scheduled for 3 PM tomorrow"}
- "Schedule a call with the team next Monday" → {"action": "create", "title": "Call with team", "due_date": "2026-07-13T09:00:00", "description": "Team call next Monday"}
- "Remind me to send the report" → {"action": "create", "title": "Send the report", "due_date": null, "description": null}
- "Meeting done" → {"action": "complete", "title_keywords": "meeting"}
- "ok so complete this task" → {"action": "complete", "title_keywords": "task"}
- "This task is in progress Arrange meeting complete it" → {"action": "complete", "title_keywords": "arrange meeting"}
- "in progress Arrange meeting" → {"action": "progress", "title_keywords": "arrange meeting"}
- "Keep the call pending" → {"action": "pending", "title_keywords": "call"}
- "Hello" → {"action": "none"}
- "What's the weather?" → {"action": "none"}

IMPORTANT: Return ONLY the JSON object, nothing else."""


def _call_ai(system_prompt: str, user_message: str, timeout: float = 15.0) -> str | None:
    """Call AI with silent fallback through all providers."""
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message}
    ]
    
    providers = _get_all_providers("auto")
    for provider_name, model in providers:
        result = _try_provider(provider_name, model, messages, timeout=timeout)
        if result:
            print(f"[AI] Task detection from {provider_name}/{model}")
            return result
    
    return None


def detect_task_action(user_message: str) -> dict:
    """Detect if user message contains a task action."""
    msg = user_message.lower().strip()

    import re

    # ===== STEP 1: Check for QUOTED task name =====
    # Pattern: "task name" in quotes — extract it as-is for matching
    quoted_match = re.search(r'[""「]([^""」]+)[""」]', user_message)
    quoted_task = quoted_match.group(1).strip() if quoted_match else None

    # ===== STEP 2: Detect action intent =====
    def _has_action_verb_at_start(text: str, verbs: list) -> bool:
        """Check if message starts with one of the action verbs (after optional politeness)."""
        for pattern in [
            r'^(please|plz|pls|kindly|can you|could you|would you|i want to|i need to|help me|hey|ok)\s+',
            r'^',
        ]:
            for verb in verbs:
                match = re.match(pattern + re.escape(verb) + r'\b', text)
                if match:
                    return True
        return False

    # Complete patterns (order matters — longest first)
    complete_patterns = [
        r'mark (?:it|this|the task|the) (?:as )?(?:done|completed?|finished)',
        r'set (?:it|this|the task) (?:as|to) (?:done|completed?|finished)',
        r'move (?:it|this|the task) (?:to|as) (?:done|completed?)',
        r'(?:mark|set|move) .+ (?:done|completed?|finished)',
        r'(?:is |are |was )?(?:already )?(?:done|completed?|finished)',
    ]
    progress_patterns = [
        r'mark (?:it |the task |the )?as in progress',
        r'set (?:it |the task )?(?:as|to) in progress',
        r'move (?:it |the task )?to in progress',
        r'(?:is |are |was )?in progress',
        r'(?:start|started|start working|working on)',
    ]
    pending_patterns = [
        r'mark (?:it |the task |the )?as pending',
        r'set (?:it |the task )?(?:as|to) pending',
        r'move (?:it |the task )?to pending',
        r'(?:is |are |was )?pending',
        r'(?:hold|postpone|later)',
    ]
    create_patterns = [
        r'(?:schedule|arrange|set up|setup|book)',
        r'(?:create|add) (?:a )?task',
        r'(?:remind(?:ed)?|reminder) (?:me|to)',
    ]

    def _check_patterns(text: str, patterns: list) -> bool:
        for pat in patterns:
            if re.search(pat, text):
                return True
        return False

    has_complete = _check_patterns(msg, complete_patterns)
    has_progress = _check_patterns(msg, progress_patterns)
    has_pending = _check_patterns(msg, pending_patterns)
    has_create = _check_patterns(msg, create_patterns)

    # ===== STEP 3: Action verb must be at sentence start =====
    # "What is my second last message return me" has "schedule" nowhere — should be none
    # "Remind me to buy flowers" has "remind" at start — should be create
    # "Please schedule a meeting" has "schedule" after "please" — should be create

    # For CREATE: action verb must appear at/near start of sentence
    create_verbs_start = [
        r'schedule', r'arrange', r'set up', r'book',
        r'create task', r'add task', r'remind me', r'reminder',
    ]
    # Check if message starts with create verb (after politeness words)
    create_at_start = False
    for pat in create_verbs_start:
        for prefix in [r'^', r'^(?:please|plz|pls|kindly|can you|could you|would you|i want to|i need to|help me)\s+']:
            if re.search(prefix + pat + r'\b', msg):
                create_at_start = True
                break
        if create_at_start:
            break

    # For COMPLETE/PROGRESS/PENDING: check if keyword appears anywhere (these are specific enough)
    # But also check if question-like patterns suggest it's NOT a task command
    is_question = re.match(r'^(what|who|where|when|why|how|which|whose|is|are|was|were|do|does|did|can|could|would|should|will|shall)\b', msg)

    # ===== STEP 4: Extract title =====
    def _clean_task_title(title: str) -> str:
        """Clean extracted task title."""
        title = title.strip()
        title = re.sub(r'^(the|a|an)\s+', '', title, flags=re.IGNORECASE).strip()
        title = re.sub(r'\s+', ' ', title).strip()
        title = title.strip('\'".,;:!?')
        return title

    def _extract_quoted_title() -> str | None:
        """If user quoted a task name, extract it."""
        if quoted_task:
            return _clean_task_title(quoted_task)
        return None

    def _extract_title_after_keyword(full_msg: str, keyword: str) -> str:
        """Extract text after a keyword, cleaned up."""
        idx = full_msg.find(keyword)
        if idx == -1:
            return ""
        after = full_msg[idx + len(keyword):].strip()
        after = after.strip('\'".,;:!?')
        # Remove common filler patterns
        fillers = [r'\b(?:this|the|that|it|task|tasks|ok|so|to|as|for|please)\b']
        for fill in fillers:
            after = re.sub(fill, '', after).strip()
        after = re.sub(r'\s+', ' ', after).strip()
        return _clean_task_title(after)

    def _extract_title_before_keyword(full_msg: str, keyword: str) -> str:
        """Extract text before a keyword, cleaned up."""
        idx = full_msg.find(keyword)
        if idx == -1:
            return ""
        before = full_msg[:idx].strip()
        # Strip action verbs and politeness words
        action_verbs = [
            r'^(?:please|plz|pls|kindly|can you|could you|would you|i want to|i need to|help me|hey|ok|i want you|i would like you to|i\'d like you to)\s+',
            r'^(?:update|mark|set|make|put|move|change|add|log)\s+',
        ]
        for verb in action_verbs:
            before = re.sub(verb, '', before).strip()
        # Strip noise
        noise = [
            r'\b(?:my task list to reflect that|my task list to reflect|my task list|the task list|task list)\b',
            r'\b(?:my list to reflect that|my list to reflect|my list)\b',
            r'\b(?:to reflect that|to reflect)\b',
            r'\b(?:the status of|the status|status of)\b',
            r'\b(?:the task|a task|this task|that task)\b',
            r'\b(?:on my list|in my list|on the list)\b',
        ]
        for n in noise:
            before = re.sub(n, '', before).strip()
        # Strip trailing fillers
        before = re.sub(r'\b(?:the|this|that|a|an|my|is|are|was|were|currently|now|as|to|it|for|please|i|you|want|would|like)\s*$', '', before).strip()
        before = before.strip('\'".,;:!?')
        before = re.sub(r'\s+', ' ', before).strip()
        return _clean_task_title(before)

    # ===== STEP 5: Route to action =====
    # Priority: list_tasks > complete > progress > pending > create

    # --- LIST TASKS (check FIRST — contains "pending" which triggers false positive) ---
    list_patterns = [
        r'(?:list|show|display|view|see|get|what are|what\'s|tell me).*(?:my |all )?(?:tasks?|pending|todo|to-do|in.progress|completed|done)',
        r'(?:pending|todo|to-do|in.progress|completed|done).*(?:tasks?|list)',
        r'what (?:are|is|do|have) (?:my |the )?(?:pending|todo|tasks?|in.progress|completed)',
    ]
    for pat in list_patterns:
        if re.search(pat, msg):
            result = {"action": "list_tasks"}
            print(f"Keyword fallback (list): {result}")
            return result

    # --- COMPLETE ---
    if has_complete:
        # Try quoted name first
        qtitle = _extract_quoted_title()
        if qtitle and len(qtitle) > 1:
            result = {"action": "complete", "title_keywords": qtitle}
            print(f"Keyword fallback (quoted): {result}")
            return result
        # Extract from keyword context — try AFTER first (usually better), then BEFORE
        for pat in complete_patterns:
            m = re.search(pat, msg)
            if m:
                kw_text = m.group(0)
                title = _extract_title_after_keyword(msg, kw_text)
                if not title or len(title) < 3:
                    title = _extract_title_before_keyword(msg, kw_text)
                if title and len(title) > 1:
                    result = {"action": "complete", "title_keywords": title}
                    print(f"Keyword fallback: {result}")
                    return result

    # --- PROGRESS ---
    if has_progress:
        qtitle = _extract_quoted_title()
        if qtitle and len(qtitle) > 1:
            result = {"action": "progress", "title_keywords": qtitle}
            print(f"Keyword fallback (quoted): {result}")
            return result
        for pat in progress_patterns:
            m = re.search(pat, msg)
            if m:
                kw_text = m.group(0)
                title = _extract_title_after_keyword(msg, kw_text)
                if not title or len(title) < 3:
                    title = _extract_title_before_keyword(msg, kw_text)
                if title and len(title) > 1:
                    result = {"action": "progress", "title_keywords": title}
                    print(f"Keyword fallback: {result}")
                    return result

    # --- PENDING ---
    if has_pending:
        qtitle = _extract_quoted_title()
        if qtitle and len(qtitle) > 1:
            result = {"action": "pending", "title_keywords": qtitle}
            print(f"Keyword fallback (quoted): {result}")
            return result
        for pat in pending_patterns:
            m = re.search(pat, msg)
            if m:
                kw_text = m.group(0)
                title = _extract_title_after_keyword(msg, kw_text)
                if not title or len(title) < 3:
                    title = _extract_title_before_keyword(msg, kw_text)
                if title and len(title) > 1:
                    result = {"action": "pending", "title_keywords": title}
                    print(f"Keyword fallback: {result}")
                    return result

    # --- CREATE ---
    if has_create and create_at_start and not is_question:
        # Extract title: everything after create keyword
        for pat in create_patterns:
            m = re.search(pat, msg)
            if m:
                kw_text = m.group(0)
                title = _extract_title_after_keyword(msg, kw_text)
                if not title:
                    title = _extract_title_before_keyword(msg, kw_text)
                if title and len(title) > 2:
                    result = {"action": "create", "title": title.title(), "due_date": None, "description": None}
                    print(f"Keyword fallback: {result}")
                    return result

    # ===== STEP 6: AI-based detection (silent fallback) =====
    # Skip AI detection for questions — they are NOT task commands
    if not is_question:
        try:
            result = _call_ai(TASK_SYSTEM_PROMPT, user_message, timeout=10.0)
            if result:
                import json
                result = result.strip()
                if result.startswith("```"):
                    result = result.split("```")[1]
                    if result.startswith("json"):
                        result = result[4:]
                result = result.strip()
                parsed = json.loads(result)
                if parsed.get("action") in ("create", "complete", "pending", "progress"):
                    print(f"Task action detected (AI): {parsed}")
                    return parsed
        except Exception as e:
            print(f"Task detection error: {e}")

    return {"action": "none"}


# ========== MAIN AI RESPONSE (Non-streaming) ==========
def get_ai_response(messages: list, model_choice: str = "auto"):
    """Get AI response with silent fallback through all providers."""
    providers = _get_all_providers(model_choice)
    
    for provider_name, model in providers:
        result = _try_provider(provider_name, model, messages, timeout=30.0)
        if result:
            print(f"[AI] Response from {provider_name}/{model}")
            return result
    
    return "I'm having trouble connecting to the AI right now. Please try again in a moment."


# ========== STREAMING AI RESPONSE ==========
def get_ai_response_stream(messages: list, model_choice: str = "auto") -> Generator[str, None, None]:
    """Stream AI response with silent fallback through all providers."""
    providers = _get_all_providers(model_choice)
    
    for provider_name, model in providers:
        try:
            stream = _try_provider(provider_name, model, messages, timeout=60.0, stream=True)
            if stream:
                print(f"[AI] Streaming from {provider_name}/{model}")
                for chunk in stream:
                    if chunk.choices[0].delta.content:
                        yield chunk.choices[0].delta.content
                return
        except Exception as e:
            print(f"[AI] Stream {provider_name}/{model} failed: {e}")
            continue
    
    yield "I'm having trouble connecting to the AI right now. Please try again in a moment."


# ========== CHAT TITLE GENERATION ==========
def generate_chat_title(first_message: str):
    """Generate chat title with silent fallback."""
    title_messages = [{"role": "user", "content": f"Summarize this message into a short title (max 5 words): {first_message}"}]
    
    providers = _get_all_providers("auto")
    for provider_name, model in providers:
        try:
            result = _try_provider(provider_name, model, title_messages, timeout=10.0)
            if result:
                return result.strip('"').strip("'")
        except Exception:
            continue
    
    return "New Chat"

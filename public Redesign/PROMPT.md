# TodoLander - Frontend Application Prompt

## Project Overview

Build a **frontend-only** Todo Calendar application called **TodoLander**. This is a UI/UX prototype with no backend, authentication service, database, API routes, or real persistence. Use mock data and localStorage for temporary state management.

**Design Style:** Neumorphism (soft UI with subtle shadows and highlights)

---

## Application Structure

### Page 1: Authentication Page (Login / Create Account)

Create a dual-mode authentication interface with toggle between Login and Create Account.

#### Login Form
- **Email** input field
- **Password** input field
- **Login** button

#### Create Account Form
- **Name** input field
- **Email** input field
- **Password** input field
- **Create Account** button

#### Branding
- Display "TodoLander" prominently at the top of the page
- Clean, minimal layout with neumorphic design

---

### Page 2: Dashboard Page

Main application interface after authentication with calendar, todo list, and management tools.

#### Header / Navigation Bar
Horizontal bar at the top containing:
1. **Search Bar** - Search through todos (by text)
2. **Settings Button** - Open settings modal
3. **Sign Out Button** - Return to login page
4. **Import Button** - Load tasks from JSON file
5. **Export Button** - Export tasks as JSON or iCal format
6. **Info Button** - Display JSON format specification modal

#### Left Sidebar: Calendar Section

**Calendar Features:**
- Full calendar view showing all days of the current month
- **Go to Today** button - Jump to current date
- **Color Filter** - Filter tasks by the following colors:
  - #ef4444 (Red)
  - #f97316 (Orange)
  - #eab308 (Yellow)
  - #22c55e (Green)
  - #3b82f6 (Blue)
  - #6c63ff (Purple)
  - #ec4899 (Pink)
- **Delete All** button - Clear all tasks (with confirmation)
- **Month Navigation** - Scroll/navigate through months
- **Clickable Days** - Click any day to view/edit that day's tasks in the main section

#### Right Sidebar / Main Section: Todo List

**Todo List Features:**
1. **Current Day Display** - Show today's date and day name
2. **Task List** - Display all tasks for the selected day
   - Show task text
   - Display task color indicator (if assigned)
   - Show "done" state (checkmark/strikethrough)
   - Allow inline editing
3. **Add Task Button/Input** - Add new tasks with:
   - Text input field
   - Color selector (dropdown with 7 supported colors)
   - Repeat option (None, Daily, Weekly, Monthly)
4. **Clear Done Button** - Remove all completed tasks for the selected day
5. **Completion Progress Bar** - Show percentage of today's tasks that are marked done
   - Display as visual bar + percentage text (e.g., "3/5 tasks (60%)")

---

## Data Model & JSON Format

### Import/Export JSON Structure

Tasks are stored as an object where:
- **Key:** Date in `YYYY-MM-DD` format
- **Value:** Array of task objects or strings

#### Task Object Format
```json
{
  "text": "Task description (required)",
  "done": false,              // Optional, defaults to false
  "color": "#22c55e",         // Optional color code
  "repeat": "none"            // Optional: "none", "daily", "weekly", "monthly"
}
```

#### Task String Format (simplified)
Plain strings are treated as tasks with no color or repeat:
```
"Simple task text"
```

#### Complete Example
```json
{
  "2026-03-10": [
    "Team standup at 9am",
    "Finish project proposal"
  ],
  "2026-03-11": [
    { "text": "Doctor appointment at 2pm" },
    { "text": "Renew car registration", "done": true },
    { "text": "Buy groceries", "color": "#22c55e" }
  ]
}
```

### Data Handling Rules
1. **Duplicate Prevention** - Skip duplicate tasks (same text on same day)
2. **Color Support** - Only these colors are valid:
   - #ef4444 (Red)
   - #f97316 (Orange)
   - #eab308 (Yellow)
   - #22c55e (Green)
   - #3b82f6 (Blue)
   - #6c63ff (Purple)
   - #ec4899 (Pink)
3. **Repeating Tasks** - When a task is set to repeat:
   - Daily: Add to next 30 days
   - Weekly: Add to same day each week for 12 weeks
   - Monthly: Add to same date each month for 12 months
4. **iCal Export** - Generate standard iCalendar format with tasks as events

---

## UI/UX Features

### Modals
1. **Settings Modal** - (placeholder for future settings)
2. **Info Modal** - Display JSON format specification
3. **Confirmation Dialog** - For destructive actions (delete all)

### Responsive Design
- Desktop-first neumorphic layout
- Clean separation between calendar, todo list, and controls
- Smooth transitions and hover states

### State Management
- Use localStorage to persist tasks between page refreshes
- Use in-memory state for UI interactions
- Mock authentication (no real backend)

---

## Design Requirements: Neumorphism

### Style Guidelines
1. **Color Palette**
   - Background: Light neutral (e.g., #e0e5ec)
   - Primary: Soft shadows (inset and outset)
   - Accent: Subtle color highlights
   
2. **Shadows & Depth**
   - Soft, diffused shadows (not sharp)
   - Outset shadows for raised elements
   - Inset shadows for pressed/active states
   
3. **Typography**
   - Clean, modern sans-serif (e.g., Inter, Poppins)
   - Generous whitespace
   - Subtle color contrast

4. **Interactive Elements**
   - Buttons: Neumorphic with hover/active states
   - Inputs: Soft background with subtle inset shadow
   - Cards: Minimal shadow, clean appearance

---

## Implementation Notes

### Technology Stack
- **HTML5** for structure
- **CSS3** for neumorphic styling (no frameworks unless necessary)
- **Vanilla JavaScript** for interactions (no external dependencies required)
- **localStorage API** for data persistence

### File Structure
```
/
├── index.html              (entry point / router)
├── login.html              (authentication page)
├── dashboard.html          (main application)
├── /css
│   ├── neumorphism.css     (design system)
│   ├── login.css           (login page styles)
│   └── dashboard.css       (dashboard styles)
├── /js
│   ├── app.js              (main app logic)
│   ├── state.js            (state management)
│   └── utils.js            (utility functions)
└── /data
    └── mock-data.json      (sample tasks for demo)
```

### Constraints
- ✅ Frontend-only (no backend required)
- ✅ Mock authentication
- ✅ localStorage for persistence
- ✅ No real API calls
- ✅ Single-page or dual-page application
- ❌ No database
- ❌ No authentication service
- ❌ No external API integrations

---

## Acceptance Criteria

- [ ] Two separate pages (Login & Dashboard) with smooth navigation
- [ ] Fully functional authentication UI with form validation
- [ ] Calendar displays current month with all days clickable
- [ ] Todo list shows tasks for selected day with full CRUD operations
- [ ] Import/Export works with correct JSON format
- [ ] Color filters work correctly
- [ ] Repeating tasks generate appropriately
- [ ] Completion progress bar updates in real-time
- [ ] Neumorphic design applied throughout
- [ ] Data persists in localStorage
- [ ] All modals (Settings, Info, Confirm) functional
- [ ] Responsive and visually polished


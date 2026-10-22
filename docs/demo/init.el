;;; init.el --- The screenshots' org setup (scripts/screenshots)  -*- lexical-binding: t; -*-

;; A made-up person's org files, their dates relative to today ({{+2}},
;; {{-3}}), copied into $DEMO_DEST and set up as an ordinary org user's:
;; keywords with fast keys, habits, logging into a drawer, a dashboard.

(require 'org)
(require 'org-agenda)
(require 'org-habit)
;; The habit graph's colors, which the page and the CLI take from the Emacs
;; theme: Modus Vivendi Tinted's, as it draws them on a color display.  This
;; daemon's only frame is a colorless terminal, where a theme's color specs
;; don't apply and org's plain blue, green and red would show.
(pcase-dolist (`(,face . ,color)
               '((org-habit-clear-face . "#2fafef") (org-habit-clear-future-face . "#1f2f8f")
                 (org-habit-ready-face . "#0fed00") (org-habit-ready-future-face . "#007800")
                 (org-habit-alert-face . "#f1e00a") (org-habit-alert-future-face . "#b08940")
                 (org-habit-overdue-face . "#b52c2c") (org-habit-overdue-future-face . "#702020")))
  (set-face-attribute face nil :background color))

(defun demo--dates (text)
  "TEXT with each {{N}} the date N days from today."
  (replace-regexp-in-string
   "{{\\([+-]?[0-9]+\\)}}"
   (lambda (m) (format-time-string "%Y-%m-%d %a" (time-add nil (* 86400 (string-to-number (match-string 1 m))))))
   text t t))

(let ((src (file-name-directory load-file-name))
      (dest (file-name-as-directory (getenv "DEMO_DEST"))))
  (make-directory dest t)
  (dolist (f (directory-files src t "\\.org\\'"))
    (with-temp-file (expand-file-name (file-name-nondirectory f) dest)
      (insert (demo--dates (with-temp-buffer (insert-file-contents f) (buffer-string))))))
  (setq org-directory dest
        org-agenda-files (mapcar (lambda (f) (expand-file-name f dest))
                                 '("inbox.org" "tasks.org" "projects.org" "calendar.org"))
        org-todo-keywords '((sequence "TODO(t)" "NEXT(n)" "WAIT(w@/!)" "|" "DONE(d)" "CANCELLED(c@)"))
        org-tag-alist '(("@home" . ?h) ("@phone" . ?p) ("@errand" . ?e) ("@computer" . ?c))
        org-log-done 'time
        org-log-into-drawer t
        org-agenda-start-on-weekday nil
        org-habit-show-habits-only-for-today t
        org-refile-targets `((,(expand-file-name "tasks.org" dest) :maxlevel . 1)
                             (,(expand-file-name "projects.org" dest) :maxlevel . 1))
        org-agenda-custom-commands
        '(("d" "Dashboard" ((agenda "" ((org-agenda-span 1))) (todo "NEXT")))
          ("i" "Inbox" tags-todo "inbox"))))

;;; init.el ends here

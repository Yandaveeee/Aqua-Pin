# AQUAPIN IT EXPERT EVALUATION TEST CASES

Good day! We are BSIT students conducting an evaluation of our system, AquaPin. Thank you for agreeing to share your technical expertise and feedback.

## ABOUT THE SYSTEM

AquaPin: A Geotagging and Geospatial Mapping System for Aquaculture Management supports the registration, mapping, monitoring, and management of aquaculture ponds. It combines an Android mobile application for field staff with a web-based administration console.

The mobile application supports pond location capture, boundary mapping, stocking records, mortality records, harvest records, pond history, offline data entry, synchronization, account preferences, data export, and an AI assistant. The web console provides an administrative dashboard, pond mapping, records review, user information, and system settings.

AquaPin stores field records locally and synchronizes them with its Supabase backend when connectivity is available. Initial authentication, cloud synchronization, web administration, and AI responses require Internet access. Offline testing applies to supported local workflows; loading uncached map imagery may still require connectivity.

## EVALUATOR INFORMATION

Evaluator name: ________________________________________
Position / organization: ________________________________________
Date of evaluation: ________________________________________
Mobile device / Android version: ________________________________________
Browser / version: ________________________________________
Application version / build: ________________________________________
APK download link or supplied file: ________________________________________
Admin console URL: ________________________________________

## PREPARATION AND RECORDING INSTRUCTIONS

The researchers should supply the evaluation APK, working admin URL, two field staff test accounts, one administrator test account, and sample pond data. Use designated evaluation records for all changes. Record the installed build and backend environment before testing.

Read each action and its expected result. Mark each checklist item Pass, Fail, Blocked, or Not Applicable in the result log. A missing prerequisite is Blocked; use Not Applicable only when a feature is intentionally outside the agreed evaluation scope, and explain why. Record actual results and supporting evidence for failures. These are proposed test cases, not results of tests already performed.

For a consistent record sequence, create a new pond named “Evaluation Pond A,” stock 1,000 fish of an available species, record 20 mortalities, and record a partial harvest of 100 fish weighing 25 kg. Where fish counts are maintained, the expected remaining count is 880 fish. Keep the pond otherwise unchanged during this sequence.

## APPLICATION INSTALLATION AND STARTUP

Purpose: Verify that the Android application installs and opens correctly.

Test cases:

- [ ] Install the researcher-supplied AquaPin APK. Verify that installation completes and the application opens without crashing.

- [ ] Launch the application again after closing it. Verify that the login screen or the appropriate signed-in screen appears.

- [ ] Grant location permission when requested. Verify that location-dependent features can be accessed.

- [ ] Deny location permission, then retry a location-dependent action. Verify that the application explains the limitation and permits recovery after permission is granted.

Section remarks: ____________________________________________________________

## AUTHENTICATION AND ACCOUNT ACCESS

Purpose: Verify login, logout, and separation of user accounts.

Test cases:

- [ ] Sign in online with valid field staff credentials. Verify that the mobile dashboard opens for the correct account.

- [ ] Attempt login with an incorrect password and with blank required fields. Verify that access is refused and a useful message appears.

- [ ] If registration is included in the evaluation, register a test account and complete any configured email verification. Verify that the account can access the intended field staff functions.

- [ ] Sign out. Verify that protected screens require authentication before they can be used again.

- [ ] Switch from field staff account A to account B on the same device. Verify that account A’s ponds, records, pending changes, and AI conversations are not displayed as account B’s data.

Section remarks: ____________________________________________________________

## POND REGISTRATION AND GEOTAGGING

Purpose: Verify pond creation and association with the intended location.

Test cases:

- [ ] Create Evaluation Pond A using the available pond registration form. Enter the required details and save. Verify that one pond appears with the correct name and entered information.

- [ ] Capture a location or place a marker using the available map controls. Verify that the saved marker corresponds to the selected position.

- [ ] Open the saved pond from the pond list and map. Verify that both views refer to the same pond.

- [ ] Attempt to save with missing required details. Verify that invalid submission is prevented and the missing information is identified.

- [ ] Search for the pond by name or its recorded species. Verify that the matching pond is returned.

Section remarks: ____________________________________________________________

## BOUNDARY MAPPING AND LOCATION EDITING

Purpose: Verify saving and editing pond geometry.

Test cases:

- [ ] Draw a valid pond boundary with at least three distinct points and save. Verify that the polygon appears for the selected pond.

- [ ] Open Edit Boundary, move a point, and add or remove a point using the available controls. Save and reopen the pond. Verify that the saved boundary matches the edit.

- [ ] Move the entire boundary and save. Verify that the polygon moves to the intended position.

- [ ] Modify a boundary and cancel. Verify that the previously saved boundary is retained.

- [ ] Attempt to save an invalid boundary, such as fewer than three distinct points. Verify that the application rejects it with useful feedback.

- [ ] Use Edit Location to reposition an existing marker. Verify that the location changes without creating a duplicate pond.

Section remarks: ____________________________________________________________

## STOCKING RECORDS

Purpose: Verify stocking entry and pond stock information.

Test cases:

- [ ] Select Evaluation Pond A and record 1,000 fish of an available species. Save. Verify that the stocking record shows the correct pond, species, quantity, and date.

- [ ] Include average weight, source, and notes where provided. Verify that saved values can be reviewed.

- [ ] Review the pond’s stock summary. Verify that the stocking entry is reflected in the displayed stock information.

- [ ] Attempt a stocking entry without a pond, without a required species, with zero quantity, and with negative quantity. Verify that invalid entries are rejected without adding records.

Section remarks: ____________________________________________________________

## MORTALITY RECORDS

Purpose: Verify mortality entry and its effect on stock information.

Test cases:

- [ ] For the newly stocked Evaluation Pond A, record 20 mortalities with a test note. Verify that the record is saved under the correct pond.

- [ ] Review the stock summary before any harvest. Verify that the remaining count is 980 fish where the system maintains fish counts.

- [ ] Attempt a negative mortality count or a count exceeding available stock. Verify that invalid entries are rejected and existing data remains unchanged.

Section remarks: ____________________________________________________________

## HARVEST RECORDS

Purpose: Verify partial and full harvest workflows.

Test cases:

- [ ] For Evaluation Pond A, select Partial harvest, enter 25 kg and a fish count of 100, and save. Verify that the harvest record retains the entered weight, count, species, and harvest type.

- [ ] Review the remaining stock after the defined stocking, mortality, and partial harvest sequence. Verify that the count is 880 fish where fish counts are maintained.

- [ ] On a separate stocked test pond, record a Full harvest. Verify that its active stock and pond status are updated consistently with a completed harvest.

- [ ] Select a pond without active stocked species. Verify that the application explains why a harvest cannot be entered.

- [ ] Attempt an invalid harvest weight or a partial harvest fish count exceeding stock. Verify that invalid entries are rejected without changing the stock summary.

Section remarks: ____________________________________________________________

## RECORD REVIEW AND POND HISTORY

Purpose: Verify retrieval, search, sorting, and activity history.

Test cases:

- [ ] Open Records and locate the test stocking, mortality, and harvest entries. Verify that each entry has the correct pond, record type, quantity, and unit.

- [ ] Search records using a pond name, species, or note. Verify that results correspond to the search.

- [ ] Switch between oldest-first and newest-first sorting. Verify chronological ordering.

- [ ] Open View Details for a record. Verify that the displayed details agree with the saved entry.

- [ ] Open pond history or Recent Activities. Verify that relevant creation, mapping, record, and synchronization events are associated with the correct pond.

- [ ] Use Clear Activities if included in the build. Verify that displayed activity history is cleared on the device while underlying pond and production records remain available.

Section remarks: ____________________________________________________________

## OFFLINE DATA ENTRY AND LOCAL PERSISTENCE

Purpose: Verify supported field operations without Internet access.

Test cases:

- [ ] While online, sign in and load the test ponds. Disable Internet access and reopen locally available pond records. Verify that the records remain accessible.

- [ ] While offline, create a test pond and enter valid stocking, mortality, and harvest records for an appropriate test pond. Verify that entries save locally and show a pending synchronization state.

- [ ] Edit an existing pond location or boundary offline using available map content. Verify that the edit is saved locally or that any unavailable prerequisite is clearly explained.

- [ ] Close and reopen the application while offline. Verify that saved local records and queued changes remain available.

- [ ] Attempt an online-only operation while offline. Verify that the application provides an understandable connection message without losing local records.

Section remarks: ____________________________________________________________

## SYNCHRONIZATION AND CONNECTION RECOVERY

Purpose: Verify transfer of local changes to the backend without duplication.

Test cases:

- [ ] Restore Internet access after offline entry. Use Sync Now or the available manual synchronization control. Verify that pending changes progress to synchronized status.

- [ ] Open the web admin console and locate the synchronized pond and production records. Verify that values match the mobile entries.

- [ ] Run synchronization again without making changes. Verify that the same records are not duplicated.

- [ ] Interrupt connectivity during synchronization, restore it, and retry. Verify that queued records are retained and appear only once after successful synchronization.

- [ ] Synchronize an edited pond boundary or location. Verify that the existing pond is updated and a second pond is not created.

- [ ] Observe a failed synchronization attempt. Verify that failure or pending status remains visible and a retry is possible.

Section remarks: ____________________________________________________________

## PROFILE AND ACCOUNT PREFERENCES

Purpose: Verify profile editing and persistence of supported preferences.

Test cases:

- [ ] Change the display name and save while online. Verify that the updated name is displayed after reopening the profile.

- [ ] Change an account preference and save. Restart the application. Verify that the saved preference is restored on the same device.

- [ ] Switch between English and Filipino. Verify that supported navigation, preference, AI action, and synchronization labels use the selected language. Record untranslated labels separately.

- [ ] Modify a preference and cancel. Verify that the previously saved value remains in effect.

- [ ] Observe Save when nothing has changed and while a save is in progress. Verify that repeated unnecessary saves are prevented.

Section remarks: ____________________________________________________________

## DATA EXPORT

Purpose: Verify that generated files accurately represent their stated scope.

Test cases:

- [ ] Open Data Tools and select each export format provided by the evaluation build, such as CSV, PDF, or text. Verify that a file can be generated and opened using a compatible application.

- [ ] Compare the exported information with the records or summary selected for export. Verify matching values, readable headings, and correct units.

- [ ] Export from an account with no relevant records. Verify that the application clearly handles empty data without presenting another account’s information.

Section remarks: ____________________________________________________________

## AI ASSISTANT

Purpose: Evaluate record-based responses, conversation history, and error handling. Internet access and a configured AI backend are required.

Test cases:

- [ ] Ask the assistant to summarize Evaluation Pond A using its saved records. Compare the response with the known stocking, mortality, and harvest data. Verify that stated figures are supported by those records.

- [ ] Ask a follow-up question in the same conversation. Verify that the answer uses the relevant conversation context.

- [ ] Start a new conversation, then reopen an earlier conversation. Verify that both remain separate and the earlier messages are restored.

- [ ] Ask about a nonexistent pond or unavailable measurement. Verify that the assistant acknowledges missing information rather than inventing records.

- [ ] Ask an unrelated question outside the assistant’s intended aquaculture scope. Verify that the response stays within the intended scope.

- [ ] Using a prepared account with more than 100 records in a relevant category, request a complete total. Verify that any partial data sample is identified and is not presented as a complete total.

- [ ] Disable connectivity and submit a question. Verify that an understandable error appears and existing conversation history remains accessible.

Section remarks: ____________________________________________________________

## WEB ADMINISTRATION

Purpose: Verify authorized system oversight using the web console.

Test cases:

- [ ] Open the supplied admin URL and sign in with the administrator test account. Verify that the dashboard loads.

- [ ] Review dashboard totals and summaries against known synchronized evaluation records, accounting for any displayed filters or time ranges. Verify that the figures agree.

- [ ] Open Pond map and select a synchronized test pond. Verify that its marker, available boundary, and details match the mobile data.

- [ ] Open Records and apply record type, pond, user, date, and sort controls where available. Verify that the resulting records meet the selected criteria.

- [ ] Use pagination where the record count exceeds one page. Verify that navigation displays the expected records without unintended repetition.

- [ ] Export the filtered records using the available export control. Verify that exported rows match the selected scope.

- [ ] Open Users and search for the evaluation accounts. Verify that profile and role information is correct.

- [ ] Change an agreed test setting, save, and reload. Verify persistence and a corresponding settings audit entry. Restore the original value afterward.

- [ ] Attempt to open an admin page while signed out and with a field staff account. Verify that unauthorized access is prevented.

Section remarks: ____________________________________________________________

## SYSTEM INTEGRATION AND RECOVERY

Purpose: Verify the complete mobile-to-admin workflow and recovery from interrupted use.

Test cases:

- [ ] Create a pond on mobile, map it, add production records, synchronize, and inspect it in the web console. Verify consistent identity, geometry, and record values throughout the workflow.

- [ ] After a confirmed local save, force-close and reopen the mobile application. Verify that saved records remain available and synchronization can resume.

- [ ] On a designated test pond, interrupt the application during a boundary save, then reopen it. Verify that the pond has a recoverable valid boundary and no duplicate pond is created.

- [ ] Repeat ordinary navigation and record review on the evaluation device. Record noticeable delays, crashes, freezes, or unclear feedback, including the action and observed duration.

Section remarks: ____________________________________________________________

## GENERAL IT EXPERT EVALUATION

In addition to the listed test cases, evaluators may explore the application and web console using the designated evaluation accounts. Please comment on functional correctness, ease of operation, responsiveness, location and record accuracy, offline usability, synchronization reliability, account separation, error recovery, mobile and web integration, and the usefulness and factual accuracy of AI responses.

## SEPARATE SOFTWARE QUALITY QUESTIONNAIRE

After completing the test cases, please accomplish the separate software quality evaluation questionnaire supplied by the researchers, if applicable. If the study uses ISO/IEC 25010:2023, identify that edition on the separate questionnaire. This functional checklist does not replace that questionnaire or establish standards compliance.

## TEST RESULT LOG

Record each checklist item separately using the format below. Copy this block as needed.

Checklist item: ____________________    Result: Pass / Fail / Blocked / Not Applicable
Actual result: ____________________________________________________________
Evidence / screenshot reference: __________________________________________
Issue or reason for Blocked / Not Applicable: ______________________________
Recommendation: __________________________________________________________

## EVALUATION SUMMARY

Passed: ______   Failed: ______   Blocked: ______   Not Applicable: ______
Main issues observed: _____________________________________________________
Suggested improvements: ___________________________________________________
Evaluator signature: __________________________    Date: _________________

Thank you for your time, technical expertise, and valuable feedback in evaluating AquaPin.

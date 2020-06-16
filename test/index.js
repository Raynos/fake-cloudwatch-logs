'use strict'

require('./groups.js')
require('./streams.js')
require('./events.js')

/**
 * TODO: tests
 *
 * [x] Query groups for two regions
 * [x] Query groups for two profiles / accountIds
 *
 * [ ] Query streams with `Descending` property.
 * [X] Query streams with `Limit` property.
 * [X] Query streams for two different groups.
 * [X] Query streams for two different regions.
 * [X] Query streams for two different profiles.
 * [ ] Query streams with `logStreamNamePrefix`
 * [ ] Query streams with `nextToken` pagination.
 * [ ] Query streams with `orderBy` property.
 *
 * [ ] Query streams when log events are being written and check
 * the state of the timestamps.
 *
 * [ ] Query HISTORICAL stream
 *    - firstEventTs
 *    - lastEventTs
 *    - creationTime
 *    - lastIngestionTime
 *
 * [ ] Query LIVE stream ; first write a few messages to, then read
 *    - firstEventTs / lastEventTs ; expect delayed
 *    - lastIngestionTime ; expect realtime
 *    - WAIT some time ( 2 hours )
 *    - query again; lastEventTs is now accurate.
 *
 * [ ] Query LIVE stream ; write data to it frequently.
 *     - Query stream & most recent log event a few times
 *     - assert ingestionTime ~correct-ish ( they are the same
 *          but we are querying two data structures in parallel
 *          so we might have newer or older logs dependent
 *          on timing of parallel reads.)
 *     - assert lastEventTs stale.
 *
 */

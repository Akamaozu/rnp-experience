const constants = require('../constants')
const {
  boldTextInHtml,
  createHtmlResponse,
  createPayload,
  escapeHtml,
  setDataNotLoadedHtmlResponse,
  setResponse,
} = require('./route-utils')

const getUserByUsername = async ctx => {
  const initialDataLoaded = ctx.state.initialDataLoaded
  if (!initialDataLoaded) {
    setDataNotLoadedHtmlResponse({ ctx, action: 'view-user' })
    return
  }

  if (!ctx.params.username) {
    const body = createHtmlResponse( ''
      + '<pre>'
        + JSON.stringify({
            action: 'load-user-pull-requests',
            user: username,
            success: false,
            error: boldTextInHtml('username not specified')
          }, null, 2)
      + '</pre>'
    )

    setResponse({ ctx, status: 400, body })
    return
  }

  const MOST_RECENT_PRS_COUNT = ctx.state.MOST_RECENT_PRS_COUNT
  const username = ctx.params.username
  const normalizedUsername = username.toLowerCase()
  const users = ctx.state.users
  const pulls = ctx.state.pulls
  const repos = ctx.state.repos

  const user = users.get(normalizedUsername)
  const payload = createPayload(ctx)

  payload.breadcrumb = ''
    + '<a href='+ escapeHtml('/') + '>home</a>'
    + ' > '
    + '<a href='+ escapeHtml('/users') + '>pr authors</a>'

  payload.user = {
    name: boldTextInHtml(normalizedUsername),
    profile: '<a href='+ escapeHtml(user.html_url) + ' target=\'_blank\'>github</a>',
    languages: pulls.index_get('author:'+ normalizedUsername).reduce((state, pullKey) => {
      const pull = pulls.get(pullKey).data
      const repo = repos.get(pull.repo_key).data
      const lang = repo.language

      if (!state.includes(lang)) state.push(lang)
      return state
    }, []).sort().join(', '),
    total_prs: pulls.index_get('author:'+ normalizedUsername).length,
    total_repos_with_user_prs: 0,
    repos_with_user_prs: {},
  }

  let userPrs = pulls.index_get('author:'+ normalizedUsername)
  if (userPrs.length > 0) {
    // get user pull requests sorted by creation time
    userPrs = userPrs
                .map(key => pulls.get(key).data)
                .sort((a, b) => {
                  if (a.created_at > b.created_at) return -1
                  if (a.created_at < b.created_at) return 1
                  return 0
                })

    // get a hash of repos user has PRs in
    payload.user.repos_with_user_prs = userPrs
                    .reduce((state, userPr) => {
                      const repoKey = userPr.repo_key

                      // repo doesn't exist in hash? create it
                      if (!state[repoKey]) {
                        const repo = repos.get(repoKey).data
                        state[repoKey] = {
                          repo: boldTextInHtml(repo.name),
                          language: boldTextInHtml(repo.language)
                        }

                        if (repo.description) {
                          state[repoKey].description = boldTextInHtml(repo.description)
                        }

                        state[repoKey].total_user_prs = 0
                        state[repoKey].most_recent_user_prs = []
                      }

                      // add repo to payload and update stats
                      state[repoKey].total_user_prs += 1
                      if (state[repoKey].most_recent_user_prs.length < parseInt(MOST_RECENT_PRS_COUNT)) {
                        state[repoKey].most_recent_user_prs.push({
                          title: escapeHtml(userPr.title),
                          url: '<a href='+ escapeHtml(userPr.html_url) +' target='+ escapeHtml('_blank') +'>'+ escapeHtml(userPr.html_url) + '</a>',
                          created: userPr.created_at,
                          state: userPr.merged_at ? 'merged' : userPr.state,
                        })
                      }

                      return state
                    }, {})

    payload.user.total_repos_with_user_prs = Object.keys(payload.user.repos_with_user_prs).length
  }

  ctx.body = createHtmlResponse('<pre>'+ JSON.stringify(payload, null, 2) +'</pre>')
}

const listUsers = async ctx => {
  const initialDataLoaded = ctx.state.initialDataLoaded
  if (!initialDataLoaded) {
    setDataNotLoadedHtmlResponse({ ctx, action: 'view-pull-request-authors' })
    return
  }

  const repos = ctx.state.repos
  const users = ctx.state.users
  const pulls = ctx.state.pulls
  const SORT_TYPES = constants.sort.PR_AUTHORS

  if (ctx.query.sort && !Object.values(SORT_TYPES).includes(ctx.query.sort)) {
    const body = createHtmlResponse( ''
                    + '<pre>'
                      + JSON.stringify({
                          action: 'load-all-pull-request-authors',
                          success: false,
                          error: boldTextInHtml('unknown sort type: '+ escapeHtml(ctx.query.sort) +'.')
                        }, null, 2)
                    + '</pre>'
                  )
    setResponse({ ctx, status: 400, body })
    return
  }

  const sort = ctx.query.sort ?? SORT_TYPES.RECENT
  const usersLanguages = users
                          .keys()
                          .reduce((state, user) => {
                            state[user] = pulls
                                            .index_get('author:'+ user)
                                            .reduce((istate, key) => {
                                              const pull = pulls.get(key)
                                              const repo = repos.get(pull.data.repo_key)
                                              const lang = repo.data.language

                                              if (lang && !istate.includes(lang)) istate.push(lang)
                                              return istate
                                            }, [])
                            return state
                          }, {})

  const sortedPullsKeys = users
                            .keys()
                            .reduce((state, user) => {
                              state[user] = pulls
                                              .index_get('author:'+ user)
                                              .sort((a, b) => {
                                                const aPull = pulls.get(a).data
                                                const bPull = pulls.get(b).data

                                                if (aPull.created_at > bPull.created_at) return -1
                                                if (aPull.created_at < bPull.created_at) return 1
                                                return 0
                                              })
                              return state
                            }, {})

  const payload = createPayload(ctx)

  payload.breadcrumb = '<a href='+ escapeHtml('/') + '>home</a>'
  payload.pr_authors = {
    sort: ''
      + (sort === SORT_TYPES.ALPHABETIC
          ? 'alphabetic'
          : '<a href=\'/users?sort=alphabetic\'>alphabetic</a>'
        )
      + ' '
      + (sort === SORT_TYPES.RECENT
          ? 'recent'
          : '<a href=\'/users?sort=recent\'>recent</a>'
        )
      + ' '
      + (sort === SORT_TYPES.POLYGLOT
          ? 'polyglot'
          : '<a href=\'/users?sort=polyglot\'>polyglot</a>'
        )
      + ' '
      + (sort === SORT_TYPES.PROLIFIC
          ? 'prolific'
          : '<a href=\'/users?sort=prolific\'>prolific</a>'
        ),
    data: users
            .keys()
            .filter(user => {
              const userPulls = pulls.index_get('author:'+ user)
              return userPulls.length > 0
            })
            .sort(
              sort === 'alphabetic'
                ? undefined // uses js default array sort
                : (a,b) => {
                  switch (sort) {
                    case 'recent':
                      const aMostRecentPr = pulls.get(sortedPullsKeys[a][0])
                      const bMostRecentPr = pulls.get(sortedPullsKeys[b][0])

                      if (aMostRecentPr.data.created_at > bMostRecentPr.data.created_at) return -1
                      if (aMostRecentPr.data.created_at < bMostRecentPr.data.created_at) return 1
                      return 0
                    break

                    case 'polyglot':
                      const aLangs = usersLanguages[a]
                      const bLangs = usersLanguages[b]

                      if (aLangs.length > bLangs.length) return -1
                      if (aLangs.length < bLangs.length) return 1
                      return 0
                    break

                    case 'prolific':
                      const aPrs = pulls.index_get('author:'+ a)
                      const bPrs = pulls.index_get('author:'+ b)

                      if (aPrs.length > bPrs.length) return -1
                      if (aPrs.length < bPrs.length) return 1
                      return 0
                    break
                  }
                }
            )
            .map(username => {
              const normalizedUsername = username.toLowerCase()
              const userPrs = pulls.index_get('author:'+ normalizedUsername)
              const reposWithUserPrs = userPrs.reduce((state, prKey) => {
                const pr = pulls.get(prKey)
                return !state.includes(pr.data.repo_key)
                  ? [].concat(state, pr.data.repo_key)
                  : state
              }, [])

              return ''
                + '<a href='+ escapeHtml('/users/'+ normalizedUsername) +'>'
                  + escapeHtml( normalizedUsername )
                + '</a>'
                + '<span style=\'color: #555; font-size: 0.85em; text-transform: uppercase; margin-left: 1em\'>'
                  + userPrs.length +' '+ (userPrs.length != 1 ? 'pulls' : 'pull')
                  + ', '+ reposWithUserPrs.length +' '+ (reposWithUserPrs.length != 1 ? 'repos' : 'repo')
                  + ', '+ usersLanguages[normalizedUsername].length +' '+ (usersLanguages[normalizedUsername].length != 1 ? 'languages' : 'language')
                + '</span>'
            }),
  }

  ctx.body = createHtmlResponse('<pre>'+ JSON.stringify(payload, null, 2) +'</pre>')
}

module.exports = {
  getUserByUsername,
  listUsers,
}
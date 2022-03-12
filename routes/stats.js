const {
  boldTextInHtml,
  createHtmlResponse,
  escapeHtml
} = require('./route-utils')

const listStats = ctx => {const GITHUB_ORG_NAME = ctx.state.GITHUB_ORG_NAME
  const orgRepos = ctx.state.orgRepos
  const orgReposPullRequests = ctx.state.orgReposPullRequests
  const orgReposPullRequestsIndex = ctx.state.orgReposPullRequestsIndex
  const orgReposPullRequestsAuthors = ctx.state.orgReposPullRequestsAuthors
  const orgDataSize = ctx.state.orgDataSize

  const usersPullRequests = ctx.state.usersPullRequests
  const usersLanguages = ctx.state.usersLanguages

  if (!orgRepos || !orgRepos.data || !orgReposPullRequests || Object.keys(orgReposPullRequests).length < orgRepos.data.length) {
    ctx.status = 503
    ctx.set('Retry-After', 60 * 5)
    ctx.body = createHtmlResponse( ''
    + '<pre>'
      + JSON.stringify({
          action: 'load-pull-request-stats',
          success: false,
          error: boldTextInHtml('org data not yet loaded. please try again later.')
        }, null, 2)
    + '</pre>'
    )

    return
  }

  const today = new Date()
  const dayOfWeek = today.getDay()
  const firstDayOfWeek = 1 // monday
  const weekStartOffset = dayOfWeek >= firstDayOfWeek
                            ? dayOfWeek - firstDayOfWeek
                            : 7 - dayOfWeek
  const startOfWeek = new Date(today.getTime() - weekStartOffset * 24 * 60 * 60 * 1000).toISOString()
  const prsThisWeek = Object.keys(orgReposPullRequests)
                        .reduce((state, repoName) => [].concat(state, orgReposPullRequests[repoName].data), [])
                        .filter(pr => pr.created_at >= startOfWeek)

  const prsThisWeekAuthors = prsThisWeek.reduce((state, pr) => {
    const normalizedUsername = pr.user.login.toLowerCase()
    if (!state[normalizedUsername]) state[normalizedUsername] = []

    state[normalizedUsername].push(pr)
    return state
  }, {})

  const activeReposThisWeek = prsThisWeek
                                .reduce((state, pr) => {
                                  if (!state[pr.base.repo.name]) state[pr.base.repo.name] = []

                                  state[pr.base.repo.name].push(pr)
                                  return state
                                }, {})

  const payload = {
    organization: boldTextInHtml(GITHUB_ORG_NAME),
    repos: {
      count: orgRepos.data.length,
      pr_authors: orgReposPullRequestsAuthors.length,
      prs: orgReposPullRequestsIndex.keys().length,
    },
    data_size: orgDataSize,
    breadcrumb: '<a href='+ escapeHtml('/') + '>home</a>',
    stats: {
      week: {
        total_prs: prsThisWeek.length,
        total_pr_authors: Object.keys(prsThisWeekAuthors).length,
        most_prolific_pr_authors: Object
                                    .keys(prsThisWeekAuthors)
                                    .sort((a,b) => {
                                      const aPrsThisWeek = prsThisWeekAuthors[a]
                                      const bPrsThisWeek = prsThisWeekAuthors[b]

                                      if (aPrsThisWeek.length > bPrsThisWeek.length) return -1
                                      if (aPrsThisWeek.length < bPrsThisWeek.length) return 1
                                      return 0
                                    })
                                    .slice(0, 3)
                                    .reduce((state, username) => {
                                      const normalizedUsername = username.toLowerCase()
                                      const totalUserPrsThisWeek = prsThisWeekAuthors[normalizedUsername].length
                                      const reposThisWeek = prsThisWeekAuthors[normalizedUsername]
                                                                  .reduce((state, pr) => {
                                                                    if (!state.includes(pr.base.repo.name)) state.push(pr.base.repo.name)
                                                                    return state
                                                                  }, [])

                                      state.push(''
                                        + '<a href='+ escapeHtml('/users/'+ normalizedUsername) + '>'+ username + '</a>'
                                        + ' '
                                        + '<span style=\'color: #555; font-size: 0.85em; text-transform: uppercase\'>'
                                        + totalUserPrsThisWeek +' pulls,'
                                          + ' '
                                          + reposThisWeek.length +' '+ (reposThisWeek.length !== 1 ? 'repos' : 'repo')
                                        + '</span>'
                                      )
                                      return state
                                    }, []),
        most_active_repos: Object
                            .keys(activeReposThisWeek)
                            .sort((a,b) => {
                              const aPrsThisWeek = activeReposThisWeek[a].length
                              const bPrsThisWeek = activeReposThisWeek[b].length

                              if (aPrsThisWeek > bPrsThisWeek) return -1
                              if (aPrsThisWeek < bPrsThisWeek) return 1
                              return 0
                            })
                            .slice(0,3)
                            .reduce((state, repoName) => {
                              const authorsThisWeek = activeReposThisWeek[repoName]
                                                .reduce((state, pr) => {
                                                  if (!state[pr.user.login.toLowerCase()]) state[pr.user.login.toLowerCase()] = 0
                                                  state[pr.user.login.toLowerCase()] += 1
                                                  return state
                                                }, {})
                              const totalAuthorsThisWeek = Object.keys(authorsThisWeek).length

                              state.push( ''
                                + repoName
                                + ' '
                                + '<span style=\'color: #555; font-size: 0.85em; text-transform: uppercase\'>'
                                  + activeReposThisWeek[repoName].length +' '+ (activeReposThisWeek[repoName].length !== 1 ? 'pulls' : 'pull')
                                  + ', '
                                  + totalAuthorsThisWeek +' '+ (totalAuthorsThisWeek !== 1 ? 'authors' : 'author')
                                + '</span>'
                              )

                              return state
                            }, [])
      }
    },
  }

  ctx.body = createHtmlResponse(
    '<pre>' + JSON.stringify(payload, null, 2) + '</pre>'
  )
}

module.exports = {
  listStats,
}